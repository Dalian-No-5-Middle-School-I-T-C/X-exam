const request = require('../utils/request');

function getSettings() {
  return request.get('/ladder/config');
}

function setEnabled(enabled) {
  return request.put('/ladder/config', { enabled: !!enabled });
}

module.exports = { getSettings: getSettings, setEnabled: setEnabled };
