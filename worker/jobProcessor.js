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
const kafkaConsumer = require('../jobQueue/kafka/kafkaConsumer');
const kafkaHandler = require('./kafka/bulkUpsertSamples');
const debug = require('debug')('k');
const activityLogUtil = require('../utils/activityLog');
const mapJobResultsToLogObject = require('../jobQueue/jobWrapper').mapJobResultsToLogObject;

module.exports = {
  processJobs(jobs, jobConcurrency) {
    Object.entries(jobs).forEach(([jobName, job]) => {
      // const concurrency = jobConcurrency[jobName];
      const concurrency = 1;
      if (featureToggles.isFeatureEnabled('useKafkaForJobQ')) {
        kafkaConsumer.subscribe((messageSet, topic, partition) => {
          debug('Subscribed topic=%s partition=%s numMessages=%d', topic, partition,
            messageSet.length);
          messageSet.forEach((m) => {
            const key = m.message.key.toString();
            const value = JSON.parse(m.message.value.toString());
            debug('emitViaKafka topic=%s partition=%s key=%s sampleName=%s (%d)',
              topic, partition, key, value.name, value.messageCode);
            return kafkaHandler(value)
              .then((jobResultObj) => {
                const logObject = {
                  jobType: 'bulkUpsertSamples',
                  jobId: job.id,
                };

                mapJobResultsToLogObject(jobResultObj, logObject);
                activityLogUtil.printActivityLogString(logObject, 'worker');
              })
              .catch((err) => {
                console.log('Error from kafka', err);
              });
          });
        });
      } else if (featureToggles.isFeatureEnabled('enableBull')) {
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
