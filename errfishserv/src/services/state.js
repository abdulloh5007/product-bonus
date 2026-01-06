const fs = require('fs');
const path = require('path');

const STATE_FILE = path.join(__dirname, '../../state.json');

let state = null;

function load() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            state = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
        }
    } catch (e) {
        console.error('Failed to load state:', e.message);
    }

    if (!state) {
        state = { sendCardToRegularChat: true };
        save();
    }

    return state;
}

function save() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
    } catch (e) {
        console.error('Failed to save state:', e.message);
    }
}

function get() {
    if (!state) load();
    return state;
}

function update(newState) {
    state = { ...state, ...newState };
    save();
    return state;
}

// Initialize on module load
load();

module.exports = {
    load,
    save,
    get,
    update
};
