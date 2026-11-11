import test from "node:test";
import assert from "node:assert/strict";
import {groupRequests,requestPrice} from "./requestMarkers.mjs";
test("price preserves zero, cents, negotiated total and unknown values",()=>{
assert.match(requestPrice({budget:0}),/0/);
assert.match(requestPrice({budget:125.5}),/125,50/);
assert.match(requestPrice({budget:10,agreed_budget:200}),/200/);
assert.equal(requestPrice({budget:null}),"A combinar");
});
test("only valid open locations are shown",()=>{
const base={lat:-16,lng:-49,status:"pendente"};
assert.equal(groupRequests([base,{...base,status:"concluido"},{...base,lat:91},{...base,expires_at:"2020-01-01"},{...base,is_expired:true}]).flatMap(g=>g.items).length,1);
});
test("coincident requests remain accessible together",()=>{
const rows=[{id:"a",lat:1,lng:2},{id:"b",lat:1,lng:2},{id:"c",lat:2,lng:3}];
const groups=groupRequests(rows);
assert.equal(groups.length,2);
assert.deepEqual(groups[0].items.map(r=>r.id),["a","b"]);
});
