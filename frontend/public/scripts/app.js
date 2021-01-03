async function handleChoreDeletion(choreName) {
    var chores = await Store.get('chores/chores');
    var newChores = chores.filter(element => element.choreName !== choreName);
    await Store.set('chores/chores', newChores)
    navigator.serviceWorker.controller.postMessage({
        type: 'CHORE_DELETION',
        deletedChore: choreName
    });
    window.location.assign('/');

}

async function handleChoreAccomplishment(choreName) {
    var chores = await Store.get('chores/chores');
    chores.forEach(element =>  {
        if (choreName === element.choreName) {
            element.choreUpdated = Date.now();
        }
    });
    await Store.set('chores/chores', chores)
    navigator.serviceWorker.controller.postMessage({
        type: 'CHORE_ACCOMPLISHED',
        accomplishedChore: choreName
    });

    window.location.assign('/');
}

async function handleNewChore(event) {
    var chores = await Store.get('chores/chores');
    chores = chores || [];
    var form = event.target.closest('form')
    var newChore = {
        choreName: Password.generate(12),
        displayName: form.querySelector('#name').value,
        choreFrequency: {
            interval: form.querySelector('#frequency').value,
            unit: form.querySelector('#unit').value,
        },
        choreUpdated: Date.now(),
        choreImage: form.querySelector('#preview').src,
        choreType: form.querySelector('#type').value
    };
    navigator.serviceWorker.controller.postMessage({
        type: 'NEW_CHORE',
        newChore: JSON.stringify(newChore)
    });
    //@todo add sanitization and validation - maybe via shared browser / server code 
    chores.push(newChore);

    await Store.set('chores/chores', chores);        
    window.location.assign('/');
}

async function createMagicLink() {
    var node = document.createElement("div");  
    var userInfo = await Store.get('personal/userinfo');
    var url = (new URL(`/recover-login/${userInfo.name}/${userInfo.userId}/${userInfo.encryptionKey}`, window.location)).href;

    node.innerHTML = `<script id="qrlib" src="/public/scripts/qrcode.min.js"></script><p>Open this URL on another device to track chores there</p><a href="${url}">${url.substring(0,64)} ...</a><div id="qrcode"></div>`;
    document.querySelector(".menu").appendChild(node);  

    const jsScript = document.createElement('script');
    jsScript.src = '/public/scripts/qrcode.min.js';

    document.body.appendChild(jsScript);

    jsScript.addEventListener('load', () => {
        new QRCode(document.getElementById("qrcode"), url);
    })
}

document.querySelector('body').addEventListener('click', event => {
    if (event.target.id === 'newChore') {  
        window.location.assign('/public/markup/choreform.html');
        event.preventDefault();
        return false;
    }
    if (event.target.id === 'newChoreSubmit') {
        handleNewChore(event)
        event.preventDefault();
        return false;
    }

    if (event.target.id === 'createMagicLink') {
        createMagicLink();
        event.preventDefault();
        return false;
    }
    return true;
});

navigator.serviceWorker.onmessage = function (evt) {
    var message = JSON.parse(evt.data);
    if (message.type === 'CLIENT_UPDATE' && message.cause === 'NEW_CHORES') {
        // maybe update via ajax
        window.location.reload();
    }
}

async function init() {
    //@todo find a synchronous way - the page is a bit jumpy
    const choreCardResponse = await fetch('/public/markup/chorecard.html');
    const choreCardTemplate = document.createElement('template');
    choreCardTemplate.innerHTML = await choreCardResponse.text();
    class ChoreCard extends HTMLElement {
        constructor() {
            super();
            this.attachShadow({mode: 'open'});
            this.shadowRoot.appendChild(choreCardTemplate.content.cloneNode(true));
            this.initCountDown();
            this.initImage();
            this.initBackground();
            setInterval(this.initCountDown.bind(this), 10000)
        }

        connectedCallback() {
            this.shadowRoot.querySelector('button.delete').addEventListener('click', evt => {
                var choreName = this.getAttribute('chore-id');
                handleChoreDeletion(choreName)
            });

            this.shadowRoot.querySelector('button.done').addEventListener('click', evt => {
                var choreName = this.getAttribute('chore-id');
                handleChoreAccomplishment(choreName)
            });
        }
        disconnectedCallback() {
            this.shadowRoot.querySelector('button.done').removeEventListener();
        }

        initCountDown() {
            var timestamp = parseInt(this.getAttribute('chore-updated'));
            var offset = 0;
            if (this.getAttribute('chore-unit') === 'Days') {
                offset = parseInt(this.getAttribute('chore-interval')) * 24 * 60 * 60 * 1000;
            } else {
                //else its minutes
                offset = parseInt(this.getAttribute('chore-interval')) * 60 * 60 * 1000;
            }
            var next = timestamp + offset - Date.now();
            var minutes = Math.floor(next / 1000 / 60);
            var hours = Math.floor(minutes / 60);
            var days = Math.floor(hours / 24)
            var countDownString = '';
            if (next > 0) {
                if (days > 0) {
                    countDownString += `${days} days ` 
                }
                if (hours - days*24 > 0) {
                    countDownString += `${hours - days*24} hours and ` 
                }
                countDownString += ` ${minutes - hours*60} minutes to go`
            } else {
                days += 1;
                countDownString += '<span class="overdue">'
                if (days < 0) {
                    countDownString += `${days} days ` 
                }
                if (hours + days*24 < 0) {
                    countDownString += `${Math.abs(hours - days*24)} hours and ` 
                }
                countDownString += `${Math.abs(minutes - hours*60)} minutes overdue</span>`
            }
            this.shadowRoot.querySelector('.next').innerHTML = countDownString;
        }

        initImage() {
            var image = this.getAttribute('chore-image');
            this.shadowRoot.querySelector('.choreimage').src = image;
        }

        initBackground() {
            var type = this.getAttribute('chore-type');
            this.shadowRoot.querySelector('.card-main').classList.add(type);
        }

    }
    window.customElements.define('chore-card', ChoreCard)
    document.body.classList.add('fade');
}
init();