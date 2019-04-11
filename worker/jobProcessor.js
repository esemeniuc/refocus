/**
 * Copyright (c) 2016, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

/**
 * /worker/jobProcessor.js
 */
'use strict'; // eslint-disable-line strict
const { jobQueue, bulkUpsertQueue } = require('../jobQueue/jobWrapper');
const executeClockJob = require('./jobs/executeClockJob');
const featureToggles = require('feature-toggles');
const path = require('path');

module.exports = {
  processJobs(jobs, jobConcurrency) {
    Object.entries(jobs).forEach(([jobName, job]) => {
      const concurrency = jobConcurrency[jobName];
      const concurrency = 1;
      if (featureToggles.isFeatureEnabled('enableBull')) {
        bulkUpsertQueue.process(job);
      } else {
        jobQueue.process(jobName, concurrency, job);
      }
    });
  },

  processClockJobs(clockJobs, clockJobConfig) {
    Object.keys(clockJobs).forEach((jobName) => {
      if (clockJobConfig.useWorker[jobName]) {
        jobQueue.process(jobName, 1, executeClockJob);
      }
    });
  },
};
