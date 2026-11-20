import test from "node:test";
import assert from "node:assert/strict";
import { matchesCategory } from "../frontend/src/lib/categorySearch.mjs";
test("accent insensitive search and trade aliases", () => {
 assert.equal(matchesCategory({slug:"iluminacao",label:"Iluminação de shows"},"iluminacao"),true);
 assert.equal(matchesCategory({slug:"diarista",label:"Diarista"},"limpeza"),true);
 assert.equal(matchesCategory({slug:"eletricista",label:"Eletricista"},"ELÉTRICA"),true);
 assert.equal(matchesCategory({slug:"tecnico_som",label:"Técnico de som"},"shows som"),true);
 assert.equal(matchesCategory({slug:"pintor",label:"Pintor"},"shows som"),false);
 assert.equal(matchesCategory({slug:"pintor",label:"Pintor"},"   "),true);
});
