const entries = {};
const cache = {
    add: (key, obj) => {
        entries[key] = entries[key] || {};
        entries[key].value = obj;
        entries[key].created = Date.now();
    },
    get: key => entries[key]?.value
};

export default {cache};