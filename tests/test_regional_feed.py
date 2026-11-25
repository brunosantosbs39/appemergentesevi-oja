import asyncio
from tests.test_scaling import local_database


def test_regional_feed_order_privacy_category_and_pagination(monkeypatch):
    async def run():
        async with local_database(monkeypatch) as (server, db):
            me = {"user_id":"viewer","lat":-23.55,"lng":-46.63}
            base = {"user_id":"author","client_id":"author","category":"dj","lat":me["lat"],"lng":me["lng"]}
            for ident, day, fields in [("local",3,{}),("old",1,{"category":"pintor"}),("far",6,{"lat":-15}),("private",8,{"request_id":"invite"}),("portfolio",9,{"kind":"portfolio"})]:
                await db.posts.insert_one({**base,"id":ident,"created_at":f"2026-11-0{day}",**fields})
            for ident,extra in [("job",{}),("invite",{"target_pro_id":"someone"}),("distant",{"lng":-47.5})]:
                await db.requests.insert_one({**base,"id":ident,"created_at":"2026-11-02","status":"pendente",**extra})
            first = await server.regional_feed(me=me,limit=2)
            assert [row["item"]["id"] for row in first["items"]] == ["local","job"]
            second = await server.regional_feed(me=me,limit=2,before=first["next_cursor"])
            assert [row["item"]["id"] for row in second["items"]] == ["old"]
            assert second["next_cursor"] is None
            filtered = await server.regional_feed(category="pintor",me=me,limit=10)
            assert [row["item"]["id"] for row in filtered["items"]] == ["old"]
            await db.users.insert_one({"user_id":"author","lat":me["lat"],"lng":me["lng"]})
            await db.posts.insert_one({"id":"legacy","created_at":"2026-11-11","user_id":"author"})
            legacy = await server.regional_feed(me=me,limit=2)
            recovered = legacy["items"][0]["item"]
            assert recovered["id"] == "legacy" and "author_region" not in recovered and "lat" not in recovered
            assert (await server.regional_feed(me={"user_id":"viewer"},limit=10))["needs_location"]
    asyncio.run(run())
