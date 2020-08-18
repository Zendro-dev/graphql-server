#!/usr/bin/env node

const { getConnection } = require('../connection')

const Sequelize = getConnection('sql');

async function checkConnection() {
  try {
    await Sequelize.authenticate()
    return process.exit(0)
  } catch (exception) {
    return process.exit(1)
  }
}

checkConnection()
