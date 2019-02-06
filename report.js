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

const profilesPromise = session.run('MATCH (p :Profile) RETURN p, id(p) ORDER BY p.direction').then(result => {
  const profiles = result.records.map(record => {
    const profile = record.get(0).properties
    profile.id = record.get(1)

    return profile
  })

  return Promise.all(profiles.map(profile => {
    return session.run(
      'MATCH (p :Profile {title: $title})-[:contains]->(c :Course)-[:takesPlaceIn]->(s :Semester)\n' +
      'RETURN\n' +
      'id(c) AS id,\n' +
      'c.title AS title,\n' +
      's.number AS semester,\n' +
      'c.laboriousness AS laboriousness,\n' +
      'c.coursework AS coursework,\n' +
      'c.project AS project,\n' +
      'c.credit AS credit,\n' +
      'c.exam AS exam\n' +
      'ORDER BY semester, title;\n', {
        title: profile.title
      }).then(result => {
      const courses = result.records.map(record => {
        return record.toObject()
      })

      const semesters_numbers = new Set()
      courses.forEach(c => {
        semesters_numbers.add(parseInt(c.semester))
      })

      profile['semesters'] = Array.from(semesters_numbers).map(s => {
        const semester = {
          number: s,
          courses: courses.filter(c => {
            return c.semester == s
          })
        }

        semester['courses_count'] = semester.courses.length

        semester['laboriousness'] = semester.courses.reduce((a, c) => {
          return a + parseInt(c.laboriousness)
        }, 0)

        semester['exams_count'] = semester.courses.reduce((a, c) => {
          return a + (c.exam ? 1 : 0)
        }, 0)

        semester['credits_count'] = semester.courses.reduce((a, c) => {
          return a + (c.credit ? 1 : 0)
        }, 0)

        semester['courseworks_count'] = semester.courses.reduce((a, c) => {
          return a + (c.coursework ? 1 : 0)
        }, 0)

        semester['projects_count'] = semester.courses.reduce((a, c) => {
          return a + (c.project ? 1 : 0)
        }, 0)

        return semester
      })

      profile['laboriousness'] = courses.reduce((a, c) => {
        return a + parseInt(c.laboriousness)
      }, 0)

      profile['courses_count'] = courses.length

      profile['exams_count'] = courses.reduce((a, c) => {
        return a + (c.exam ? 1 : 0)
      }, 0)

      profile['credits_count'] = courses.reduce((a, c) => {
        return a + (c.credit ? 1 : 0)
      }, 0)

      profile['courseworks_count'] = courses.reduce((a, c) => {
        return a + (c.coursework ? 1 : 0)
      }, 0)

      profile['projects_count'] = courses.reduce((a, c) => {
        return a + (c.project ? 1 : 0)
      }, 0)

      return profile
    })
  }))
})

const notesPromise = session.run('MATCH (c :Course)\n' +
  'RETURN id(c) AS id, c.title AS title, c.notes AS notes\n' +
  'ORDER BY title').then(result => {
  const notes = result.records.map(record => {
    return record.toObject()
  })

  return Promise.all(notes.map(note => {
    return session.run('MATCH (c :Course {title: $title})\n' +
      'MATCH (c)-[:dependsOn]->(d)\n' +
      'RETURN d.title AS dependencie\n' +
      'ORDER BY dependencie', {
        title: note.title
      }
    ).then(result => {
      const dependencies = new Set()

      result.records.map(record => {
        return record.toObject()
      }).forEach(d => {
        dependencies.add(d.dependencie)
      })

      note.dependencies = Array.from(dependencies)

      return note
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
      'id(c) as id,\n' +
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
      }, 0) * 36 / 2

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

Promise.all([profilesPromise, notesPromise, teachersPromise]).then(([profiles, notes, teachers]) => {
    const report = handlebars.compile(fs.readFileSync('./report.handlebars').toString())
    process.stdout.write(report({
      profiles: profiles,
      notes: notes,
      teachers: teachers
    }))
  })
  .then(() => {
    session.close()
    driver.close()
  })
