import { isoNow, jsonValue, normaliseRow } from './helpers.js';

function normaliseProposal(row) {
  const proposal = normaliseRow(row);
  if (!proposal) return null;
  return {
    ...proposal,
    entity_id:proposal.entity_id === null ? null : Number(proposal.entity_id),
    location_id:proposal.location_id === null ? null : (proposal.location_id === undefined ? null : Number(proposal.location_id)),
    base_payload:jsonValue(proposal.base_payload, {}),
    proposed_payload:jsonValue(proposal.proposed_payload, {}),
    items:jsonValue(proposal.items_json, []),
    location_name:jsonValue(proposal.proposed_payload,{}).location_name || proposal.location_name || null
  };
}

async function enrichRequestLocations(pool,proposals) {
  const missing=[...new Set(proposals.flatMap((proposal)=>(proposal.items || []).flatMap((item)=>{
    const ids=[];
    if (item.location_id && !item.location_name) ids.push(Number(item.location_id));
    for (const id of item.location_ids || []) {
      if (!item.location_names?.[id]) ids.push(Number(id));
    }
    return ids;
  }).filter((id)=>Number.isSafeInteger(id) && id>0)))];
  if (!missing.length) return proposals;
  const {rows}=await pool.query('SELECT id,name FROM locations WHERE id=ANY($1::bigint[])',[missing]);
  const names=new Map(rows.map((location)=>[Number(location.id),location.name]));
  return proposals.map((proposal)=>({
    ...proposal,
    items:(proposal.items || []).map((item)=>{
      const next={...item};
      if (next.location_id && !next.location_name) {
        next.location_name=names.get(Number(next.location_id)) || '';
      }
      if (Array.isArray(next.location_ids)) {
        next.location_names={...(next.location_names || {})};
        for (const id of next.location_ids) {
          if (!next.location_names[id] && names.has(Number(id))) {
            next.location_names[id]=names.get(Number(id));
          }
        }
      }
      return next;
    })
  }));
}

export function createCatalogProposalsRepository(pool) {
  return Object.freeze({
    async listCatalogProposals({ managerUsername = null, status = null, entityType = null } = {}) {
      const clauses = [];
      const values = [];
      if (managerUsername) {
        values.push(managerUsername);
        clauses.push('p.manager_username = ' + String.fromCharCode(36) + values.length);
      }
      if (status === 'history') {
        clauses.push("p.status <> 'pending'");
      } else if (status) {
        values.push(status);
        clauses.push('p.status = ' + String.fromCharCode(36) + values.length);
      }
      if (entityType) {
        values.push(entityType);
        clauses.push('p.entity_type = ' + String.fromCharCode(36) + values.length);
      }
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await pool.query(`SELECT p.*, l.name AS location_name FROM catalog_change_proposals p LEFT JOIN locations l ON l.id=p.location_id${where} ORDER BY p.created_at DESC, p.id DESC`, values);
      const proposals=rows.map(normaliseProposal);
      // Historical request lines predate the manufacturer snapshot. Resolve
      // missing names in one DB query; never require manager catalog access.
      const missing=[...new Set(proposals.flatMap((proposal)=>
        (proposal.items || [])
          .filter((item)=>!item.producer && Number.isSafeInteger(Number(item.product_id)) && Number(item.product_id)>0)
          .map((item)=>Number(item.product_id))
      ))];
      let enriched=proposals;
      if (missing.length) {
        const products=await pool.query(
          'SELECT id,name,producer FROM catalog_products WHERE id=ANY($1::bigint[])',[missing]
        );
        const byId=new Map(products.rows.map((product)=>[Number(product.id),product]));
        enriched=proposals.map((proposal)=>({
          ...proposal,
          items:(proposal.items || []).map((item)=>{
            const product=byId.get(Number(item.product_id));
            if (!product || item.producer) return item;
            return {...item,name:item.name || product.name,producer:product.producer};
          })
        }));
      }
      return enrichRequestLocations(pool,enriched);
    },

    async getCatalogProposal(id) {
      const { rows } = await pool.query('SELECT * FROM catalog_change_proposals WHERE id=$1', [id]);
      const proposal=normaliseProposal(rows[0]);
      if (!proposal) return null;
      return (await enrichRequestLocations(pool,[proposal]))[0];
    },

    async getCatalogProposalForUpdate(id) {
      const { rows } = await pool.query('SELECT * FROM catalog_change_proposals WHERE id=$1 FOR UPDATE', [id]);
      return normaliseProposal(rows[0]);
    },

    async createCatalogProposal({ managerUsername, entityType, entityId, baseUpdatedAt, basePayload, proposedPayload, description = '' }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO catalog_change_proposals
          (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,description,status,created_at,updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,$8) RETURNING *`,
        [managerUsername, entityType, entityId, baseUpdatedAt, JSON.stringify(basePayload), JSON.stringify(proposedPayload), description, now]
      );
      return normaliseProposal(rows[0]);
    },

    async createMessageCard({ managerUsername, title, description, locationId = null, locationName = '' }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO catalog_change_proposals
          (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,title,description,location_id,status,created_at,updated_at)
         VALUES ($1,'message',NULL,NULL,'{}'::jsonb,$6::jsonb,$2,$3,$4,'pending',$5,$5)
         RETURNING *`,
        [managerUsername,title,description,locationId,now,JSON.stringify({location_name:locationName})]
      );
      return normaliseProposal(rows[0]);
    },


    async createWorkflowRequest({ managerUsername, requestType, items, description = '' }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO catalog_change_proposals
          (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,
           description,status,request_type,items_json,created_at,updated_at,status_changed_at)
          VALUES ($1,'request',NULL,NULL,'{}'::jsonb,'{}'::jsonb,$2,'pending',$3,$4,$5,$5,$5)
          RETURNING *`,
        [managerUsername,description,requestType,JSON.stringify(items),now]
      );
      return normaliseProposal(rows[0]);
    },

    async updateWorkflowRequest(id, { items, status, reviewerUsername = null,
      reviewComment = '', productId = null }) {
      const { rows } = await pool.query(
        `UPDATE catalog_change_proposals
           SET items_json=$2, status=$3, reviewer_username=$4, review_comment=$5,
               catalog_product_id=COALESCE($6,catalog_product_id),
               status_changed_at=CASE WHEN status<>$3 THEN NOW() ELSE status_changed_at END,
               decided_at=CASE WHEN $3 IN ('approved','rejected','conflict') THEN NOW() ELSE NULL END,
               revision=revision+1, updated_at=NOW()
         WHERE id=$1 AND entity_type='request' RETURNING *`,
        [id,JSON.stringify(items),status,reviewerUsername,reviewComment,productId]
      );
      return normaliseProposal(rows[0]);
    },

    async recordProposalEvent(id, actor, action, details = {}) {
      await pool.query(
        'INSERT INTO catalog_proposal_events (proposal_id,actor,action,details_json) VALUES ($1,$2,$3,$4)',
        [id,actor,action,JSON.stringify(details)]
      );
    },

    async listProposalEvents(id) {
      const { rows } = await pool.query(
        'SELECT actor,action,details_json,created_at FROM catalog_proposal_events WHERE proposal_id=$1 ORDER BY id',
        [id]
      );
      return rows.map((row) => ({ ...row, details:jsonValue(row.details_json,{}) }));
    },

    async deleteOwnPendingProposal(id, username) {
      const { rows } = await pool.query(
        "DELETE FROM catalog_change_proposals WHERE id=$1 AND manager_username=$2 AND status='pending' AND catalog_product_id IS NULL RETURNING id",
        [id,username]
      );
      return rows.length > 0;
    },

    async deleteProposal(id) {
      const { rows } = await pool.query('DELETE FROM catalog_change_proposals WHERE id=$1 RETURNING id', [id]);
      return rows.length > 0;
    },

    async reviseMessageCard(id,{ title,description,locationId,locationName = '',managerUsername }) {
      const { rows } = await pool.query(
        `UPDATE catalog_change_proposals
            SET title=$3,description=$4,location_id=$5,status='pending',
                proposed_payload=jsonb_set(proposed_payload,'{location_name}',to_jsonb($6::text),true),
                review_comment='',reviewer_username=NULL,decided_at=NULL,
                status_changed_at=NOW(),updated_at=NOW(),revision=revision+1
          WHERE id=$1 AND manager_username=$2 AND entity_type='message' AND status='rework' RETURNING *`,
        [id,managerUsername,title,description,locationId,locationName]
      );
      return normaliseProposal(rows[0]);
    },

    async resolveCatalogProposal(id, { status, reviewerUsername = null, reviewComment = '' }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `UPDATE catalog_change_proposals
         SET status=$1, reviewer_username=$2, review_comment=$3, updated_at=$4::timestamptz, decided_at=CASE WHEN $1='rework' THEN NULL ELSE $4::timestamptz END, status_changed_at=$4::timestamptz
         WHERE id=$5 AND status='pending' RETURNING *`,
        [status, reviewerUsername, reviewComment, now, id]
      );
      return normaliseProposal(rows[0]);
    }
  });
}
