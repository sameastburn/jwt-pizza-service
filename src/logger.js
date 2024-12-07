const Logger = require('pizza-logger');
const config = require('./config.js');
const logger = new Logger(config);

module.exports = { logger };
