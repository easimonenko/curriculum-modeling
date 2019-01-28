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

const profilesPromise = session.run('MATCH (p :Profile) RETURN p').then(result => {
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
      profile['exams_count'] = profile['courses'].reduce((a, c) => {
        return a + (c.exam ? 1 : 0)
      }, 0)
      profile['credits_count'] = profile['courses'].reduce((a, c) => {
        return a + (c.credit ? 1 : 0)
      }, 0)
      profile['courseworks_count'] = profile['courses'].reduce((a, c) => {
        return a + (c.coursework ? 1 : 0)
      }, 0)
      profile['projects_count'] = profile['courses'].reduce((a, c) => {
        return a + (c.project ? 1 : 0)
      }, 0)
      return profile
    })
  }))
})

const teachersPromise = session.run('MATCH (t :Teacher) RETURN t').then(result => {
  const teachers = result.records.map(record => {
    return record.get(0).properties
  })

  return Promise.all(teachers.map(teacher => {
    return session.run(
      'MATCH (t :Teacher {surname: $surname, name: $name})-[:teaches]->(c :Course)-[:takesPlaceIn]->(s :Semester)\n' +
      'MATCH (c)<-[:contains]-(p :Profile)' +
      'RETURN\n' +
      'c.title as title,\n' +
      'p.direction as direction,\n' +
      's.number as semester,\n' +
      'c.laboriousness as laboriousness,\n' +
      'c.coursework as coursework,\n' +
      'c.project as project,\n' +
      'c.credit as credit,\n' +
      'c.exam as exam\n' +
      'ORDER BY semester, title, direction;\n', {
        surname: teacher.surname,
        name: teacher.name
      }).then(result => {
      teacher['courses'] = result.records.map(record => {
        return record.toObject()
      })
      teacher['laboriousness'] = teacher['courses'].reduce((a, c) => {
        return a + parseInt(c.laboriousness)
      }, 0) * 36 / 2;
      teacher['courses_count'] = teacher['courses'].length
      teacher['exams_count'] = teacher['courses'].reduce((a, c) => {
        return a + (c.exam ? 1 : 0)
      }, 0)
      teacher['credits_count'] = teacher['courses'].reduce((a, c) => {
        return a + (c.credit ? 1 : 0)
      }, 0)
      teacher['courseworks_count'] = teacher['courses'].reduce((a, c) => {
        return a + (c.coursework ? 1 : 0)
      }, 0)
      teacher['projects_count'] = teacher['courses'].reduce((a, c) => {
        return a + (c.project ? 1 : 0)
      }, 0)
      return teacher
    })
  }))
})

Promise.all([profilesPromise, teachersPromise]).then(([profiles, teachers]) => {
    const report = handlebars.compile(fs.readFileSync('./report.handlebars').toString())
    process.stdout.write(report({
      profiles: profiles,
      teachers: teachers
    }))
  })
  .then(() => {
    session.close()
    driver.close()
  })
