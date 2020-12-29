import Koa from 'koa';
import sanitize from 'sanitize';
import Router from 'koa-router';
import bodyParser from 'koa-bodyparser';
import MongoDB from 'mongodb';
const MongoClient = MongoDB.MongoClient;

const app = new Koa();
const router = new Router();
app.use(bodyParser());
app.use(router.routes());

const dbName = 'chorinator';

const connection = await MongoClient.connect(`mongodb://localhost:27017/${dbName}`, { useUnifiedTopology: true });
const db = connection.db(dbName);

const collection = db.collection('chores');
collection.createIndex({ user : 1, choreName: 1}, { unique:true },);
collection.createIndex({ user : 1, version: 1});

const userstate = db.collection('userstate');
userstate.createIndex({ user : 1 }, { unique:true },);

const deletions = db.collection('deletions');
deletions.createIndex({ user : 1, choreName: 1}, { unique:true },);
deletions.createIndex({ user : 1, version: 1});

const sanitizer = sanitize();

async function ensureUserTable(context, next)  {
    var user = await userstate.findOne({user: context.params.userid}, {});
    if (!user) {
        await userstate.insertOne({user: context.params.userid, version: 1});
    }
    next();
}

/*
curl localhost:3001/chores/holger/
*/
router.get('/chores/:userid', ensureUserTable, async context => {
    const result = await collection.find({user: context.params.userid}, {}).toArray();
    context.body = JSON.stringify(result);
});

/*
curl localhost:3001/chore-sync/holger/3
*/
router.get('/chore-sync/:userid/:clientversion', ensureUserTable, async context => {
    const clientVersion = sanitizer.value(context.params.clientversion, 'int');
    const user = await userstate.findOne({user: context.params.userid}, {});
    var serverVersion = user.version;
    const activeChores = await collection.find({user: context.params.userid, version: {$lte:serverVersion, $gte:clientVersion}}, {}).toArray();
    const deletedChores = await deletions.find({user: context.params.userid, version: {$lte:serverVersion, $gte:clientVersion}}, {}).toArray();
    const result = {activeChores, deletedChores};

    context.body = JSON.stringify(result);
});


function parseChore(body, choreName, userid) {
    var result = {};

    if (!body.choreFrequency || 
        !body.choreFrequency.interval || 
        !body.choreFrequency.unit) {
        throw new Error('No Chorefrequency set')
    }
    result.choreFrequency = {
        interval: sanitizer.value(body.choreFrequency.interval, 'int'),
        unit: sanitizer.value(body.choreFrequency.unit, 'str')
    };
    result.displayName = sanitizer.value(body.displayName, 'str');
    result.user = sanitizer.value(userid, 'str');
    result.choreName = sanitizer.value(choreName, 'str');

    return result;
}

/*
curl --data "{\"choreFrequency\": {\"interval\": 90, \"unit\":\"minutes\"}, \"displayName\": \"gießen\"}" -H "Accept: application/json" -H "Content-Type: application/json" localhost:3001/chores/holger/giessen
*/

router.post('/chores/:userid/:chorename', ensureUserTable, async context => {
    let body;
    try {
        body = parseChore(context.request.body, context.params.chorename, context.params.userid);
        if (body) {
            const user = await userstate.findOne({user: context.params.userid}, {});
            var version = user.version + 1;
            body.addedIn = Date.now();
            body.version = version;
            const result = await collection.insertOne(body, {});
            if (result.result.ok === 1) {
                 await userstate.updateOne({user: context.params.userid},{ $set: {version: version} }, { upsert: true });
            }
            context.body = JSON.stringify({update: result.result, versionChange: versionUpdate.result});
        }
    } catch (exception) {
        context.status = 400;
        context.body = JSON.stringify({"error": exception.message});
        context.app.emit('error', exception, context);
    }
});

/*
 curl localhost:3001/chores/holger/giessen/done -H "Accept: application/json" -H "Content-Type: application/json" -X PUT
*/
router.put('/chores/:userid/:chorename/done', ensureUserTable, async context => {
    const user = await userstate.findOne({user: context.params.userid}, {});
    var version = user.version + 1;
    const result = await collection.updateOne({choreName: context.params.chorename},{ $set: {choreUpdated: Date.now(), version: version} }, { upsert: true });
    if (result.result.ok === 1) {
        await userstate.updateOne({user: context.params.userid},{ $set: {version: version} }, { upsert: true });
    }
    context.body = JSON.stringify(result.result);
});

/*
 curl localhost:3001/chores/holger/giessen --data "{\"choreFrequency\": {\"interval\": 70, \"unit\":\"minutes\"}, \"displayName\": \"gießen\"}" -H "Accept: application/json" -H "Content-Type: application/json" -X PUT
*/
router.put('/chores/:userid/:chorename', ensureUserTable, async context => {
    let chore;
    try {
        chore = parseChore(context.request.body, context.params.chorename, context.params.userid);
    } catch (exception) {
        context.status = 400;
        context.body = JSON.stringify({"error": exception.message});
        context.app.emit('error', exception, context);
    }
    if (chore) {
        const user = await userstate.findOne({user: context.params.userid}, {});
        var version = user.version + 1;
        chore.version = version;
        const result = await collection.updateOne({choreName: context.params.chorename},{ $set: chore }, { upsert: true });
        if (result.result.ok === 1) {
             await userstate.updateOne({user: context.params.userid},{ $set: {version: version} }, { upsert: true });
        }
        context.body = JSON.stringify(result.result);
    }
});


/*
curl localhost:3001/generate-mock-data
*/
router.get('/generate-mock-data', ensureUserTable, async context => {
    collection.insertOne({user: 'holger', docFormat: 'v1', addedIn: Date.now(), choreName: 'gießen', choreUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000), choreFrequency: {interval: 2, unit: 'days'}, version: 1});
    collection.insertOne({user: 'timo', docFormat: 'v1', addedIn: Date.now(), choreName: 'sport', choreUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000), choreFrequency: {interval: 3, unit: 'days'}, version: 2});
    collection.insertOne({user: 'holger', docFormat: 'v1', addedIn: Date.now(), choreName: 'sport', choreUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000), choreFrequency: {interval: 1, unit: 'days'}, version: 3});
    collection.insertOne({user: 'holger', docFormat: 'v1', addedIn: Date.now(), choreName: 'teigkneten', choreUpdated: Date.now() - (1 * 24 * 60 * 60 * 1000), choreFrequency: {interval: 1, unit: 'days'}, version: 3});
    deletions.insertOne({user: 'holger', choreName: 'einkaufen', version: 2});

    const all = await collection.find({user: 'holger'}, {}).toArray();
    context.body = JSON.stringify(all);
});

/*
    curl localhost:3001/clear 
 */
router.get('/clear', ensureUserTable, async context => {
    var result = collection.drop();
    deletions.drop();
    userstate.drop();
    context.body = JSON.stringify(result);
});

app.on('error', (err) => {
    console.error('App Error', err)
  });

app.listen(3001);
