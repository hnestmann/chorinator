async function checkForPreExistingInstallation() {
    var cache = await caches.open('personal');
    var entry = await cache.match('/userinfo');
    if (entry) {
        var text = await entry.text();
        var userInfo = JSON.parse(text);
        if (userInfo.userId) {
            window.location.assign('/');
        }
    }
}

if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
        navigator.serviceWorker.register('/service-worker.js').then(function(registration) {
            document.getElementById('register-button').disabled = false;
            checkForPreExistingInstallation();
        }, function(err) {
            console.error('ServiceWorker registration failed: ', err);
        });
    });
}

async function handleRegistration() {
    var userName = document.getElementById('user').value;
    if (userName) {
        var cache = await caches.open('personal');
        var userInfo = { 
            userId: Password.generate(12),
            encryptionKey: Password.generate(64),
            name: userName,
            version: 1
        }
        var resp = new Response(JSON.stringify(userInfo));
        cache.put('/userinfo', resp);
        window.location.assign('/');
    }
}

var Password = {
    _pattern : new RegExp('[a-zA-Z0-9_]'),
    _getRandomByte : () => {
        var result = new Uint8Array(1);
        window.crypto.getRandomValues(result);
        return result[0];
    },
    
    generate : length => {
        return Array.apply(null, {'length': length}).map(() => {
            var result;
            while(true) {
                result = String.fromCharCode(Password._getRandomByte());
                if(Password._pattern.test(result)) {
                    return result;
                }
            }        
        }, this)
        .join('');  
    }     
};

document.querySelector('body').addEventListener('click', event => {
    if (event.target.id === 'register-button') {  
        handleRegistration();
        event.preventDefault();
        window.location.reload();
        return false;
    }
    return true;
});