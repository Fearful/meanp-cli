var module = require(process.cwd() + '/package.json');
var meanpVersion = module.meanp || module.version;
module.exports = require('./lib/meanp');