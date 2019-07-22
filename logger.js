/**
 * Copyright (c) 2019, salesforce.com, inc.
 * All rights reserved.
 * Licensed under the BSD 3-Clause license.
 * For full license text, see LICENSE.txt file in the repo root or
 * https://opensource.org/licenses/BSD-3-Clause
 */

const KafkaProducer = require('no-kafka');
const kafkaConfig = require('./config/kafkaLoggingConfig').getConfig();
const winston = require('winston');
const featureToggles = require('feature-toggles');
const EventEmitter = require('events');

class LogEmitter extends EventEmitter {}
const logEmitter = new LogEmitter();

let producer;
const initKafkaLoggingProducer = () => {
  if (featureToggles.isFeatureEnabled('kafkaLogging')) {
    producer = new KafkaProducer.Producer({
      connectionString: kafkaConfig.connectionString,
      ssl: {
        cert: kafkaConfig.sslCert,
        key: kafkaConfig.sslKey,
      },
    });
    return producer.init().catch((err) => {
      throw new Error(`Failed to initialized Kafka producer for logging,
      error: ${err}`);
    });
  }

  return Promise.resolve();
};

const logFunc = {
  info: winston.info,
  warn: winston.warn,
  error: winston.error,
  silly: winston.silly,
  verbose: winston.verbose,
  debug: winston.debug,
};

const writeLocalLog = (logMessage) => {
  logFunc[logMessage.message.key](logMessage.message.value);
};

const writeLog = (value, key = 'info', topic = kafkaConfig.topic,
    localCallback = winston.info) => {
  logEmitter.emit('logging', value);
  const messageValue = {
    sendTimeStamp: new Date(),
    value,
  };
  const logMessage = {
    topic,
    partition: 0,
    message: {
      key,
      value: JSON.stringify(messageValue),
    },
  };
  let promise;
  if (featureToggles.isFeatureEnabled('kafkaLogging')) {
    promise = producer.send(logMessage).catch((err) => {
      localCallback(`Sending the log message to Kafka cluster failed,
      retrying, error: ${err}`);
      producer.send(logMessage); // retry again if failed
    });
  }

  if (featureToggles.isFeatureEnabled('localLogging')) {
    localCallback('Local logging is turned on');
    logFunc[logMessage.message.key](logMessage.message.value);
  }

  return promise ? promise : Promise.resolve();
};

module.exports = {
  initKafkaLoggingProducer,
  writeLog,
  error: (...args) => args.map((value) => writeLog(value, 'error')),
  warn: (...args) => args.map((value) => writeLog(value, 'warn')),
  info: (...args) => args.map((value) => writeLog(value, 'info')),
  debug: (...args) => args.map((value) => writeLog(value, 'debug')),
  verbose: (...args) => args.map((value) => writeLog(value, 'verbose')),
  silly: (...args) => args.map((value) => writeLog(value, 'silly')),
  on: (event, func) => logEmitter.on(event, func),
  removeListener: (event, func) => logEmitter.removeListener(event, func),
};
