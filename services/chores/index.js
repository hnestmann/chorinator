import Koa from 'koa';
import sanitize from 'sanitize';
import Router from 'koa-router';
import MongoDB from 'mongodb';
import fileType from 'file-type';
import * as fileSystemAll from 'fs';
import { request } from 'http';
const FileSystem = fileSystemAll.promises;

const MongoClient = MongoDB.MongoClient;

const app = new Koa();
const router = new Router();

/**
 *  Super simple request body getter promisified
 *  @todo - make secure or get koa-bodyparser up an running
 */
function getBody(rawRequest) {
    var promise = new Promise((resolve, reject) => {
        let data = '';

        rawRequest.on('data', chunk => {
            data += chunk;
        })
        rawRequest.on('end', () => {
            resolve(data);
        })

        rawRequest.on('error', () => {
            reject();
        })
        
    });

    return promise;
}

app.use(async (context, next) => {
    var rawRequest = await context.req;
    context.request.bodyText = await getBody(rawRequest)
    await next();
});
app.use(router.routes());

const configRaw = await FileSystem.readFile("./config.json", "utf-8");
const config = JSON.parse(configRaw);
const dbName = 'chorinator';

const connection = await MongoClient.connect(config.mongo.url, { useUnifiedTopology: true });
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
    await next();
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
    const result = {version : serverVersion};
    if (serverVersion !== clientVersion) {
        const activeChores = await collection.find({user: context.params.userid, version: {$lte:serverVersion, $gte:clientVersion}}, {}).toArray();
        const deletedChores = await deletions.find({user: context.params.userid, version: {$lte:serverVersion, $gte:clientVersion}}, {}).toArray();
        result.activeChores = activeChores;
        result.deletedChores = deletedChores;
    }

    context.body = JSON.stringify(result);
});

function dataURItoUint8Array(dataURI) {
    // convert base64 to raw binary data held in a string
    // doesn't handle URLEncoded DataURIs - see SO answer #6850276 for code that does this
    var byteString = Buffer.from(dataURI.split(',')[1], 'base64').toString('binary');
    
    // write the bytes of the string to an ArrayBuffer
    var ab = new ArrayBuffer(byteString.length);
    var ia = new Uint8Array(ab);
    for (var i = 0; i < byteString.length; i++) {
        ia[i] = byteString.charCodeAt(i);
    }
    return ia;
}


async function parseChore(body, choreName, userid) {
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
    result.choreUpdated = sanitizer.value(body.choreUpdated, 'int');
    if (body.choreImage && body.choreImage.startsWith('data:image/png;base64,')) {
        const buffer = Buffer.from(body.choreImage.split(',')[1], 'base64');
        const type = await fileType.fromBuffer(buffer);
        if (type.mime === 'image/png') { 
            result.choreImage = body.choreImage
        }
    }
    result.choreType = sanitizer.value(body.choreType, 'str');
    return result;
}

/*
curl -H "Accept: application/json" -H "Content-Type: application/json" -X DELETE localhost:3001/chores/holger/giessen
*/
router.delete('/chores/:userid/:chorename', ensureUserTable, async context => {
    const user = await userstate.findOne({user: context.params.userid}, {});
    var version = user.version + 1;
    var versionUpdate;
    const result = await collection.deleteOne({choreName: context.params.chorename}, {});
    if (result.result.ok === 1 && result.deletedCount === 1) {
        versionUpdate = await userstate.updateOne({user: context.params.userid},{ $set: {version: version} }, { upsert: true });
        context.body = JSON.stringify({newVersion: version});
    } else {
        context.body = JSON.stringify({error: true});
    }
});
/*
curl --data "{\"choreFrequency\": {\"interval\": 90, \"unit\":\"minutes\"}, \"displayName\": \"gießen\"}" -H "Accept: application/json" -H "Content-Type: application/json" https://chores-service.herokuapp.com/chores/holger/giessen
*/
router.post('/chores/:userid/:chorename', ensureUserTable, async context => {
    let body;
    console.info(context.request.bodyText);
    try {
        body = await parseChore(JSON.parse(context.request.bodyText), context.params.chorename, context.params.userid);
        if (body) {
            const user = await userstate.findOne({user: context.params.userid}, {});
            var version = user.version + 1;
            body.addedIn = Date.now();
            body.version = version;
            var versionUpdate;
            const result = await collection.insertOne(body, {});
            if (result.result.ok === 1) {
                versionUpdate = await userstate.updateOne({user: context.params.userid},{ $set: {version: version} }, { upsert: true });
            }
            context.body = JSON.stringify({update: result.result, versionChange: versionUpdate.result, newVersion: version});
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

app.listen(process.env.PORT || 3001);
