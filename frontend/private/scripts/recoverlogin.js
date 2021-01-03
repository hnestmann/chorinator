if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        installServiceWorker()
    });
}

async function installServiceWorker() {
    try {
        var registration = await navigator.serviceWorker.register('/service-worker.js');
        if (registration) {
            recoverRegistration();
        }
    } catch (err) {
        console.error('ServiceWorker registration failed: ', err);
    };
}

async function recoverRegistration() {
    var url = new URL(window.location.href);
    var paths = url.pathname.split('/');

    var cache = await caches.open('personal');
    var userInfo = { 
        userId: paths[3],
        encryptionKey: paths[4],
        name: paths[2],
        version: 1
    }
    var resp = new Response(JSON.stringify(userInfo));
    cache.put('/userinfo', resp);
    window.location.assign('/');}

