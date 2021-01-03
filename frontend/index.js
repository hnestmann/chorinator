import Koa from 'koa';
import Router from 'koa-router';
import mount from 'koa-mount';
import serve from 'koa-static';
import * as fileSystemAll from 'fs';
import * as cacheAll from './server/cache.js'
import minifyLib from 'html-minifier';
import bodyParser from 'koa-bodyparser';
import fetch from 'node-fetch'

const cache = cacheAll.default.cache;
const FileSystem = fileSystemAll.promises;
const app = new Koa();
const router = new Router();
app.use(bodyParser());
app.use(router.routes());

const configRaw = await FileSystem.readFile("./config.json", "utf-8");
const config = JSON.parse(configRaw);

async function getFileContents(path) {
    var result;
    if (cache.get(path)) {
        result = cache.get(path);
    }  else {
        const data = await FileSystem.readFile(path, "utf-8");
        cache.add(path, data)
        result = data;
    }
    return result;
}

async function getPreloginInline() {
    var result = {};
    result.script = await getFileContents('private/scripts/prelogin.js');
    result.style = await getFileContents('private/styles/critical.css');
    return result;
}

async function getRecoverInline() {
    var result = {};
    result.script = await getFileContents('private/scripts/recoverlogin.js');
    result.style = await getFileContents('private/styles/critical.css');
    return result;
}

router.get('/service-worker.js', async context => {
    context.body = await getFileContents("public/scripts/service-worker.js");
    context.type = 'application/javascript';
});

app.use( mount( '/public', serve('./public') ) ) ;

router.all(/\/proxy(.*)/, async context => {
    var path = context.params[0];
    var host = config.choreservice.url;
    var fetchUrl = host + path;
    var fetchOptions = {};
    console.info(context.request.headers);
    if (context.method !== 'GET' && context.method !== 'HEAD') {
        var body = JSON.stringify(context.request.body);
        fetchOptions = {
            method: context.method,
            body: body
        };
    };

    var response = await fetch(fetchUrl, fetchOptions);
    var bodyText = await response.text();
    context.body = bodyText;
});

router.get('/', async context => {      
    const inlineStatic = await getPreloginInline(); 
    let body;
    if (cache.get('home')) {
    body = cache.get('home');
    } else {
        const bodyUncompressed = `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <title>Chorinator</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta name="Description" content="Chorinator is a little secure private web app to keep track off recurring chores">
                </head>
                <style>
                    ${inlineStatic.style}
                </style>
                
                <body data-chore-service="${config.choreservice.url}">
                    <h1>Welcome to Chorinator</h1>
                    <p>To start please enter your username. A secure encryption key will be generated for you</p>
                    <form>
                        <fieldset>
                            <label for="user">User</label>
                            <input name="user" id="user" placeholder="User"/>
                            <button id="register-button" disabled="disabled">Register</button>
                        </fieldset>
                    </form>
                    <script>
                        ${inlineStatic.script}
                    </script>
                </body>
            </html>
        `;
        body = minifyLib.minify(bodyUncompressed, {
            removeAttributeQuotes: true,
            minifyCSS: true,
            minifyJS: true,
            removeComments: true,
            removeTagWhitespace: true,
            collapseWhitespace: true,
            collapseInlineTagWhitespace: true,
            removeRedundantAttributes: true
        });
        cache.add('home', body);
    }
    
    
    context.body = body;
});

router.get('/recover-login/:username/:userid/:encryptionkey', async context => {      
    const inlineStatic = await getRecoverInline(); 
    let body;
    if (cache.get('home')) {
    body = cache.get('home');
    } else {
        const bodyUncompressed = `<!DOCTYPE html>
            <html lang="en">
                <head>
                    <title>Chorinator</title>
                    <meta name="viewport" content="width=device-width, initial-scale=1">
                    <meta name="Description" content="Chorinator is a little secure private web app to keep track off recurring chores">
                </head>
                <style>
                    ${inlineStatic.style}
                </style>
                
                <body data-chore-service="${config.choreservice.url}">
                    <h1>Welcome to Chorinator</h1>
                    <p>You shouldnt really see this :)</p>
                    <script>
                        ${inlineStatic.script}
                    </script>
                </body>
            </html>
        `;
        body = minifyLib.minify(bodyUncompressed, {
            removeAttributeQuotes: true,
            minifyCSS: true,
            minifyJS: true,
            removeComments: true,
            removeTagWhitespace: true,
            collapseWhitespace: true,
            collapseInlineTagWhitespace: true,
            removeRedundantAttributes: true
        });
        cache.add('home', body);
    }
    
    
    context.body = body;
});

app.listen(process.env.PORT || 3000);
