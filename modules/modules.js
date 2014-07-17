'use strict';

/**
 * Module dependencies.
 */

module.exports = function(database) {
    var Schema = database.connection.Schema;
    /**
     * Package Schema
     */
    var ModuleSchema = new Schema({
        name: String,
        settings: {},
        updated: {
            type: Date,
            default: Date.now
        }
    });

    database.connection.model('Module', ModuleSchema);
}
