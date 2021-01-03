importScripts('/public/scripts/utils.js');

function renderChores(chores) {
    var template = '';
    // @todo move templates into central place /public/markup/partials
    chores.forEach(chore => { 
        template += `<chore-card chore-id="${chore.choreName}" chore-unit="${chore.choreFrequency?.unit}" chore-interval="${chore.choreFrequency?.interval}" chore-updated="${chore.choreUpdated}" chore-image="${chore.choreImage}" chore-type="${chore.choreType}">
                        <div slot="chorename">${chore.displayName}</div>
                        <div slot="chorefrequency"/>Every ${chore.choreFrequency?.interval} ${chore.choreFrequency?.unit}</div>
                    </chore-card>` 
                    
    });
    return template;
}

// @todo move templates into central place /public/markup/
function renderTemplate(userName, chores) {
    const template = `<!DOCTYPE html>
        <html lang="en">
        <head>
            <title>Chorinator</title>
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <meta name="Description" content="Chorinator is a little secure private web app to keep track off recurring chores">
            <link href="/public/styles/app.css" rel="stylesheet">
        </head>
        <body>

            <div class="grid">${renderChores(chores)}</div>
            <div class="menu">
                <div class="topline">
                    <p>Hi ${userName}</p>
                    <button id="createMagicLink">Share on Other Devices</button>
                    <button id="newChore">New Chore</button>
                </div>
            </div>
            <div class="spacer">
        </body>
        <script src="/public/scripts/utils.js"></script>
        <script src="/public/scripts/app.js"></script>
    </html>
    `
    return template;
}

async function mergeChores(activeChores, deletedChores) {
    var chores = await Store.get('chores/chores');
    chores = chores || [];
    var hashSet = new Map();
    chores.concat(activeChores).forEach(function(obj) {
        hashSet.set(obj.choreName, Object.assign(hashSet.get(obj.choreName) || {}, obj))
    });
    var result = Array.from(hashSet.values());

    result.filter(element => {!deletedChores.includes(element.id)});
    await Store.set('chores/chores', result);

}
async function checkForRemoteUpdates() {

    var userInfo = await Store.get('personal/userinfo');

    var serverResponse = await fetch('/proxy/chore-sync/' + userInfo.userId + '/' + userInfo.version);
    var serverJSON = await serverResponse.json();

    if(serverJSON.version !== userInfo.version) {
        await mergeChores(serverJSON.activeChores, serverJSON.deletedChores);
        
        userInfo.version = serverJSON.version;
        Store.set('personal/userinfo', userInfo)
        
        updateClient('NEW_CHORES');
    }

}

async function updateClient(cause) {
    var clients = await self.clients.matchAll();
    clients.forEach(client => {
        const message = {
            type: 'CLIENT_UPDATE',
            cause: cause
        }

        client.postMessage(JSON.stringify(message));
    });
}

async function handleRequest(event) {
    const url = new URL(event.request.url);
    if (self.location.origin === url.origin && (url.pathname.endsWith('.css') || url.pathname.endsWith('.js') || url.pathname.endsWith('.html') || url.pathname.endsWith('.png'))) {
        var static = await caches.open('static');
        var match = await static.match(event.request);

        if (match) {
            return match
        };
        var fetchRespone = await fetch(event.request);

        if (!fetchRespone || fetchRespone.status !== 200 || fetchRespone.type !== 'basic') {
            return response;
        }
        var responseToCache = fetchRespone.clone();
        static.put(event.request, responseToCache);

        return fetchRespone;
    }
    var cache = await caches.open('personal');
    var entry = await cache.match('/userinfo');
    if (entry && url.pathname === '/' && !url.search) {
        var text = await entry.text();
        var userInfo = JSON.parse(text);

        var choresCache = await caches.open('chores');
        var choresResponse = await choresCache.match('/chores');
        var chores = [];
        if (choresResponse) {
            var choresText = await choresResponse.text();
            chores = JSON.parse(choresText);
        }
        checkForRemoteUpdates();
        var response = new Response(renderTemplate(userInfo.name, chores), { headers: { "Content-Type": "text/html" } })
        return response;
    } else {
        var response = await fetch(event.request);
        return response;
    }
};

async function addChore(newChore) {   
    var cache = await caches.open('personal');
    var entry = await cache.match('/userinfo');
    var text = await entry.text(); 
    var userInfo = JSON.parse(text);

    var url = '/proxy/chores/' + userInfo.userId + '/' + newChore.choreName
    
    var response = await fetch(url, {
        method: 'POST', 
        headers: {
            'Content-Type': 'application/json',
            'x-encryption-key': userInfo.encryptionKey
        },
        redirect: 'follow', // manual, *follow, error
        referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url
        body: JSON.stringify(newChore) // body data type must match "Content-Type" header
    });

    var serverSyncResponse = await response.json();
    userInfo.version = serverSyncResponse.newVersion;
    var newCacheEntry = new Response(JSON.stringify(userInfo));
    // @todo - add error handling  
    await cache.put('/userinfo', newCacheEntry);

    return serverSyncResponse;
}

async function removeChore(choreName) {   
    var userInfo = await Store.get('personal/userinfo');
    var url = '/proxy/chores/' + userInfo.userId + '/' + choreName
    
    var response = await fetch(url, {
        method: 'DELETE', 
        headers: {
            'Content-Type': 'application/json',
            'x-encryption-key': userInfo.encryptionKey
        },
        redirect: 'follow', // manual, *follow, error
        referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url// body data type must match "Content-Type" header
    });

    var serverSyncResponse = await response.json();
    userInfo.version = serverSyncResponse.newVersion;
    // @todo - add error handling  
    await Store.set('personal/userinfo', userInfo);

    return serverSyncResponse;
}

async function accomplishChore(choreName) {   
    var userInfo = await Store.get('personal/userinfo');
    var url = '/proxy/chores/' + userInfo.userId + '/' + choreName + '/done'
    
    var response = await fetch(url, {
        method: 'PUT', 
        headers: {
            'Content-Type': 'application/json',
            'x-encryption-key': userInfo.encryptionKey
        },
        redirect: 'follow', // manual, *follow, error
        referrerPolicy: 'no-referrer', // no-referrer, *no-referrer-when-downgrade, origin, origin-when-cross-origin, same-origin, strict-origin, strict-origin-when-cross-origin, unsafe-url// body data type must match "Content-Type" header
    });

    var serverSyncResponse = await response.json();
    userInfo.version = serverSyncResponse.newVersion;
    // @todo - add error handling  
    await Store.set('personal/userinfo', userInfo);

    return serverSyncResponse;
}

this.addEventListener('message', (event) => {
    if (event?.data?.type === 'NEW_CHORE') {
        addChore(JSON.parse(event.data.newChore))
    }

    if (event?.data?.type === 'CHORE_DELETION') {
        removeChore(event.data.deletedChore)
    }

    if (event?.data?.type === 'CHORE_ACCOMPLISHED') {
        accomplishChore(event.data.accomplishedChore)
    }

});

this.addEventListener('fetch', (event) => {
    event.respondWith(handleRequest(event));
});

this.addEventListener('install', function (event) {
    event.waitUntil(
        caches.open('static').then(function (cache) {
            return cache.addAll([
                '/public/backgrounds/exercise.png',
                '/public/backgrounds/groceries.png',
                '/public/backgrounds/laundry.png',
                '/public/backgrounds/water-plants.png',
                '/public/markup/chorecard.html',
                '/public/markup/choreform.html',
                '/public/scripts/app.js',
                '/public/scripts/camera.js',
                '/public/scripts/qrcode.min.js',
                '/public/scripts/utils.js',
                '/public/styles/app.css',
                '/public/styles/choreform.css',
            ]);
        })
    );
});