import test from 'node:test';
import assert from 'node:assert/strict';
import {
  MANAGER_ERROR_REPORT_TITLE,
  managerErrorReportInput,
  createManagerErrorReport
} from '../src/services/manager-error-report-service.js';

test('manager report accepts diagnostic fields only and strips query tokens and credentials', () => {
  const result = managerErrorReportInput({
    message:'Сбой. Bearer abc.def.ghi password=topsecret',
    stack:'at /app/file.js?token=abcdef',
    page:'/manager?request=17&token=abc#here',
    source:'manager-request-form',
    operation:'price_change',
    request:{method:'POST',path:'/api/manager/proposals/request?token=private',status:400},
    positions:[{product_id:42,product_name:'Лагер',location_id:5,screen_id:9,row_id:'line',
      property:'price_primary',new_value:'220',secret:'NEVER_INCLUDE'}],
    occurred_at:'2026-11-14T02:00:00Z',
    password:'NEVER_INCLUDE'
  });
  assert.equal(result.page,'/manager');
  assert.equal(result.request.path,'/api/manager/proposals/request');
  assert.equal(result.request.status,400);
  assert.equal(result.positions[0].product_id,42);
  assert.equal(result.positions[0].new_value,'220');
  assert.equal(result.message.includes('topsecret'),false);
  assert.equal(result.stack.includes('abcdef'),false);
  assert.equal(JSON.stringify(result).includes('NEVER_INCLUDE'),false);
});

test('one click creates a CRM inquiry, event history and audit in a single transaction', async () => {
  const calls = [];
  let transactions=0;
  const tx={
    async createMessageCard(input) {
      calls.push({name:'card',input});
      return {id:73};
    },
    async recordProposalEvent(...args) { calls.push({name:'history',args}); },
    async recordActivity(input) { calls.push({name:'audit',input}); }
  };
  const store={ async transaction(run) { transactions++;return run(tx); } };
  const result=await createManagerErrorReport(store,{
    managerUsername:'manager-1',userAgent:'Chromium test',
    raw:{
      message:'Некорректное значение: Товар',
      page:'/manager',source:'crm-request-submit',
      request:{method:'POST',path:'/api/manager/proposals/request',status:400},
      positions:[{product_id:123,product_name:'Сидр',new_value:'230'}]
    }
  });
  assert.deepEqual(result,{id:73});
  assert.equal(transactions,1);
  assert.deepEqual(calls.map(x=>x.name),['card','history','audit']);
  assert.equal(calls[0].input.managerUsername,'manager-1');
  assert.equal(calls[0].input.title,MANAGER_ERROR_REPORT_TITLE);
  assert.match(calls[0].input.description,/товар ID 123/);
  assert.deepEqual(calls[1].args.slice(0,3),[73,'manager-1','error_report']);
  assert.equal(calls[1].args[3].user_agent,'Chromium test');
  assert.equal(calls[2].input.severity,'error');
  assert.equal(calls[2].input.entity_id,73);
  assert.equal(calls[2].input.actor_username,'manager-1');
});

test('invalid or empty reports never create CRM records', async () => {
  let created=false;
  const store={async transaction() {created=true;}};
  for (const raw of [null,{},[],{message:'   '}]) {
    await assert.rejects(createManagerErrorReport(store,{managerUsername:'manager',raw}),
      /отчёт|Сообщение об ошибке/);
  }
  assert.equal(created,false);
});
