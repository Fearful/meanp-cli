'use strict';

var meanp = require('../..'),
    should = require('should');

describe('meanp.js', function() {

    it('exports an object', function() {
        should.exist(meanp);
        meanp.should.be.an.Object;
    });

});
