import Koa from 'koa';
import Router from 'koa-router';
import mount from 'koa-mount';
import serve from 'koa-static';
import * as fileSystemAll from 'fs';
import * as cacheAll from './server/cache.js'

const cache = cacheAll.default.cache;
const FileSystem = fileSystemAll.promises;
const app = new Koa();
const router = new Router();
app.use(router.routes());

const configRaw = await FileSystem.readFile("./config.json", "utf-8");
const config = JSON.parse(configRaw);

router.get('/service-worker.js', async context => {
    if (cache.get('/service-worker.js')) {
        context.body = cache.get('/service-worker.js');
    }  else {
        const data = await FileSystem.readFile("public/scripts/service-worker.js", "utf-8");
        context.body = data;
    }
});

app.use( mount( '/public', serve('./public') ) ) ;

router.get('/', async context => {
    context.body = `
        <html>
            <head>
                <title>Chorinator</title>
            </head>
            <body data-chore-service="${config.choreservice.url}">
                Hello World
                <script>
                if ('serviceWorker' in navigator) {
                    window.addEventListener('load', function() {
                        navigator.serviceWorker.register('/service-worker.js').then(function(registration) {
                            // Registration was successful
                            console.log('ServiceWorker registration successful with scope: ', registration.scope);
                        }, function(err) {
                        // registration failed :(
                            console.log('ServiceWorker registration failed: ', err);
                        });
                    });
                }
                </script>
            </body>


        </html>
    `
});

app.listen(3000);
