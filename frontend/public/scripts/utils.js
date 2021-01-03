
/**
 *  Shared Script between service worker and app
 */
const Store = {
    get: async function get(path) {
        var pathElements = path.split('/');
        var cache = await caches.open(pathElements[0]);
        var entry = await cache.match('/' + pathElements[1]);
        if (entry) {
            var text = await entry.text();
            var object = JSON.parse(text);
            return object;
        }
    },
    set: async function set(path, value) {
        try {
            var pathElements = path.split('/');
            var cache = await caches.open(pathElements[0]);
            cache.put('/'+ pathElements[1], new Response(JSON.stringify(value)));
        } catch (e) {
            console.error(e);
        }
    }
}

const Password = {
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
