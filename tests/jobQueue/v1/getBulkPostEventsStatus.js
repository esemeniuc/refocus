/**
 * Copyright (c) 2018, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * tests/jobQueue/v1/getBulkPostEventStatus.js
 */

const jobSetup = require('../../../jobQueue/setup');
const jobQueue = jobSetup.jobQueue;
const expect = require('chai').expect;
const supertest = require('supertest');
const api = supertest(require('../../../express').app);
const tu = require('../../testUtils');
const u = require('./utils');
const constants = require('../../../api/v1/constants');
const path = '/v1/events/bulk';
const getStatusPath = '/v1/events/bulk/{jobId}/status';
const bulkPostEventsJob = require('../../../worker/jobs/bulkPostEvents');
const timeoutMillis = 800;
const featureToggles = require('feature-toggles');
const bulkPostEventsQueue = jobSetup.bulkPostEventsQueue;

describe('tests/jobQueue/v1/getBulkPostEventStatus.js, ' +
`api: GET ${getStatusPath} >`, () => {
  before(() => jobSetup.resetJobQueue());
  after(() => jobSetup.resetJobQueue());

  let token;
  before((done) => {
    tu.toggleOverride('enableWorkerProcess', true);
    tu.createToken()
    .then((returnedToken) => {
      token = returnedToken;
      return done();
    })
    .catch((err) => done(err));
  });
  before(() => {
    if (featureToggles.isFeatureEnabled('enableBullForBulkPostEvents') &&
        featureToggles.isFeatureEnabled('anyBullEnabled')) {
      bulkPostEventsQueue.process(jobSetup.jobType.bulkPostEvents,
        bulkPostEventsJob);
    }
  });

  after(u.forceDelete);
  after(tu.forceDeleteUser);
  after(() => {
    tu.toggleOverride('enableWorkerProcess', false);
  });

  // skipping as this route is being removed
  it.skip('OK, bulkPostEvents processed without errors should be in complete ' +
    'state without any errors', (done) => {
    let jobId;
    api.post(path)
    .set('Authorization', token)
    .send([
      {
        log: 'Something cool happened!',
      },
      {
        log: 'Something even cooler happened!',
      },
    ])
    .expect(constants.httpStatus.OK)
    .expect((res) => {
      expect(res.body.status).to.contain('OK');
      expect(res.body).to.have.property('jobId');
      jobId = res.body.jobId;
    })
    .then(() => {
      // call the worker
      if (!featureToggles.isFeatureEnabled('enableBullForBulkPostEvents') &&
        !featureToggles.isFeatureEnabled('anyBullEnabled')) {
        jobQueue.process(jobSetup.jobType.bulkPostEvents, (job, done) => {
          bulkPostEventsJob(job, done);
        });
      }

      /*
       * Bulk API is asynchronous. The delay is used to give time for upsert
       * operation to complete.
       */
      setTimeout(() => {
        api.get(getStatusPath.replace('{jobId}', jobId))
        .set('Authorization', token)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res.body.status).to.equal('complete');
          expect(res.body.errors.length).to.equal(0);
          done();
        });
      }, timeoutMillis);
    });
  });

  // skipping as this route is being removed
  it.skip('FAIL, bulkPostEvents is in complete state but processed ' +
    ' with an error', (done) => {
    let jobId;
    api.post(path)
    .set('Authorization', token)
    .send([
      {
        log: 'Something cool happened!',
      },
      {
        log: 'Something even cooler happened!',
        roomId: 123456789,
      },
    ])
    .expect(constants.httpStatus.OK)
    .expect((res) => {
      expect(res.body.status).to.contain('OK');
      expect(res.body).to.have.property('jobId');
      jobId = res.body.jobId;
    })
    .then(() => {
      // call the worker
      if (!featureToggles.isFeatureEnabled('enableBullForBulkPostEvents') &&
        !featureToggles.isFeatureEnabled('anyBullEnabled')) {
        jobQueue.process(jobSetup.jobType.bulkPostEvents, (job, done) => {
          bulkPostEventsJob(job, done);
        });
      }

      /*
      * Bulk API is asynchronous. The delay is used to give time for upsert
      * operation to complete.
      */
      setTimeout(() => {
        api.get(getStatusPath.replace('{jobId}', jobId))
        .set('Authorization', token)
        .end((err, res) => {
          if (err) {
            return done(err);
          }

          expect(res.body.status).to.equal('complete');
          expect(res.body.errors.length).to.equal(1);
          done();
        });
      }, timeoutMillis);
    });
  });
});
