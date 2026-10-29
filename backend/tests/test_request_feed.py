"""Query-level regression tests without database credentials.
Run: python -m unittest discover -s backend/tests -p test_request_feed.py
"""
import ast
from pathlib import Path
from types import SimpleNamespace
from typing import Optional
import unittest

def run(coro):
    try:
        coro.send(None)
    except StopIteration as done:
        return done.value
    raise AssertionError("Unexpected external IO")

class Collection:
    def __init__(self):
        self.rows = []
        self.query = None
    def find(self, query, projection):
        self.query = query
        return self
    def sort(self, sort):
        self.order = sort
        return self
    async def to_list(self, limit):
        return self.rows[:limit]
    def aggregate(self, query, **kwargs):
        self.query = query
        return self

class RequestFeedTests(unittest.TestCase):
    def setUp(self):
        path = Path(__file__).resolve().parents[1] / "server.py"
        if not path.exists():
            path = Path(__file__).with_name("server.py")
        tree = ast.parse(path.read_text(encoding="utf-8-sig"))
        names = {"feed_requests", "available_requests", "vacancy_open_query"}
        nodes = [node for node in tree.body if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)) and node.name in names]
        for node in nodes:
            node.decorator_list = []
        self.collection = Collection()
        async def enrich(rows, *args, **kwargs):
            return rows
        self.ns = dict(Optional=Optional, Query=lambda value, **kw: value,
            Depends=lambda value: None, onboarded=None,
            db=SimpleNamespace(requests=self.collection), now_iso=lambda:"2026-10-29T12:00:00",
            CATEGORIES={"dj":{}, "pintor":{}}, enrich_requests=enrich,
            parse_cursor=lambda value: tuple(value.split("|")),
            page_cursor=lambda stamp, ident: stamp+"|"+ident,
            nearby_pipeline=lambda query,*args,**kw:query)
        exec(compile(ast.Module(body=nodes, type_ignores=[]),str(path),"exec"),self.ns)
        self.me = {"user_id":"viewer","categories":["dj"]}

    def test_public_feed_open_and_private_excluded(self):
        run(self.ns["feed_requests"](me=self.me))
        query = self.collection.query
        self.assertEqual(query["status"],"pendente")
        self.assertIsNone(query["target_pro_id"])
        self.assertNotIn("category",query)
        self.assertEqual(query["$and"][0],{"$or":[{"expires_at":None},{"expires_at":{"$gt":"2026-10-29T12:00:00"}}]})

    def test_cursor_preserves_open_constraint(self):
        self.collection.rows = [{"id":str(i),"created_at":"2026"} for i in range(3)]
        result = run(self.ns["feed_requests"](category="pintor",before="2027|z",limit=2,me=self.me))
        self.assertEqual(len(result["items"]),2)
        self.assertEqual(result["next_cursor"],"2026|1")
        self.assertEqual(len(self.collection.query["$and"]),2)
        self.assertEqual(self.collection.query["category"],"pintor")
        self.assertEqual(self.collection.order,[("created_at",-1),("id",-1)])

    def test_last_page_has_no_cursor(self):
        result = run(self.ns["feed_requests"](me=self.me))
        self.assertIsNone(result["next_cursor"])

    def test_profile_categories_and_visibility(self):
        run(self.ns["available_requests"](my_categories=True,me=self.me))
        query = self.collection.query
        self.assertEqual(query["category"],{"$in":["dj"]})
        self.assertEqual(query["client_id"],{"$ne":"viewer"})
        self.assertEqual(query["$or"],[{"target_pro_id":None},{"target_pro_id":"viewer"}])

    def test_missing_categories_returns_empty_without_query(self):
        self.me["categories"]=[]
        self.assertEqual(run(self.ns["available_requests"](my_categories=True,me=self.me)),[])
        self.assertIsNone(self.collection.query)

    def test_explicit_category_cannot_escape_profile(self):
        self.assertEqual(run(self.ns["available_requests"](my_categories=True,category="pintor",me=self.me)),[])
        self.assertIsNone(self.collection.query)

    def test_legacy_map_can_still_request_all_categories(self):
        run(self.ns["available_requests"](me=self.me))
        self.assertNotIn("category",self.collection.query)

if __name__ == "__main__":
    unittest.main()
