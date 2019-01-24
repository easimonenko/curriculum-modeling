'use strict'

/**
 * report.js
 * This file is a part of curriculum-modeling project.
 * License: MIT
 * (c) Evgeny Simonenko, 2019
 */

const fs = require('fs')
const handlebars = require('handlebars')
const neo4j = require('neo4j-driver').v1

const neo4jConfig = require('./neo4j-config.json')

const neo4jUri = neo4jConfig.url + ':' + parseInt(neo4jConfig.port).toString()
const neo4jAuth = neo4j.auth.basic(neo4jConfig.user, neo4jConfig.password)
const driver = neo4j.driver(neo4jUri, neo4jAuth)
const session = driver.session()

session.run('MATCH (p :Profile) RETURN p').then(result => {
  const profiles = result.records.map(record => {
    return record.get(0).properties
  })

  return Promise.all(profiles.map(profile => {
    return session.run(
      'MATCH (p :Profile {title: $title})-[:contains]->(c :Course)-[:takesPlaceIn]->(s :Semester)\n' +
      'return\n' +
      'c.title as title,\n' +
      's.number as semester,\n' +
      'c.laboriousness as laboriousness,\n' +
      'c.coursework as coursework,\n' +
      'c.project as project,\n' +
      'c.credit as credit,\n' +
      'c.exam as exam\n' +
      'ORDER BY semester, title;\n', {
        title: profile.title
      }).then(result => {
      profile['courses'] = result.records.map(record => {
        return record.toObject()
      })
      profile['laboriousness'] = profile['courses'].reduce((a, c) => {
        return a + parseInt(c.laboriousness)
      }, 0)
      profile['courses_count'] = profile['courses'].length
      return profile
    })
  })).then(profiles => {
    const report = handlebars.compile(fs.readFileSync('./report.handlebars').toString())
    process.stdout.write(report({
      profiles: profiles
    }))
  })
}).then(() => {
  session.close()
  driver.close()
})
