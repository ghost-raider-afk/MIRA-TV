import { isoNow, jsonValue, normaliseRow } from './helpers.js';

function normaliseProposal(row) {
  const proposal = normaliseRow(row);
  if (!proposal) return null;
  return {
    ...proposal,
    entity_id:proposal.entity_id === null ? null : Number(proposal.entity_id),
    location_id:proposal.location_id === null ? null : (proposal.location_id === undefined ? null : Number(proposal.location_id)),
    base_payload:jsonValue(proposal.base_payload, {}),
    proposed_payload:jsonValue(proposal.proposed_payload, {})
  };
}

export function createCatalogProposalsRepository(pool) {
  return Object.freeze({
    async listCatalogProposals({ managerUsername = null, status = null, entityType = null } = {}) {
      const clauses = [];
      const values = [];
      if (managerUsername) {
        values.push(managerUsername);
        clauses.push(`manager_username = $${values.length}`);
      }
      if (status) {
        values.push(status);
        clauses.push(`status = ${values.length}`);
      }
      if (entityType) {
        values.push(entityType);
        clauses.push(`entity_type = ${values.length}`);
      }
      const where = clauses.length ? ` WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await pool.query(`SELECT * FROM catalog_change_proposals${where} ORDER BY created_at DESC, id DESC`, values);
      return rows.map(normaliseProposal);
    },

    async getCatalogProposal(id) {
      const { rows } = await pool.query('SELECT * FROM catalog_change_proposals WHERE id=$1', [id]);
      return normaliseProposal(rows[0]);
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

    async createMessageCard({ managerUsername, title, description, locationId = null }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `INSERT INTO catalog_change_proposals
          (manager_username,entity_type,entity_id,base_updated_at,base_payload,proposed_payload,title,description,location_id,status,created_at,updated_at)
         VALUES ($1,'message',NULL,NULL,'{}'::jsonb,'{}'::jsonb,$2,$3,$4,'pending',$5,$5)
         RETURNING *`,
        [managerUsername,title,description,locationId,now]
      );
      return normaliseProposal(rows[0]);
    },

    async resolveCatalogProposal(id, { status, reviewerUsername = null, reviewComment = '' }) {
      const now = isoNow();
      const { rows } = await pool.query(
        `UPDATE catalog_change_proposals
         SET status=$1, reviewer_username=$2, review_comment=$3, updated_at=$4, decided_at=$4
         WHERE id=$5 AND status='pending' RETURNING *`,
        [status, reviewerUsername, reviewComment, now, id]
      );
      return normaliseProposal(rows[0]);
    }
  });
}
