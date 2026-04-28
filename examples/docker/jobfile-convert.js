import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const inputPath = __dirname
const outputPath = path.join(__dirname, '..', 'output')

export default {
  // Sample task: convert the bundled krawler-icon.png to JPG via the imagemagick
  // container. When the krawler is launched as a web API (--api flag), tasks are
  // posted dynamically and this list is ignored.
  tasks: [{
    id: 'krawler-icon',
    type: 'noop'
  }],
  hooks: {
    tasks: {
      before: {
        tar: {
          cwd: inputPath,
          file: path.join(outputPath, '<%= id %>.tar'),
          files: ['<%= id %>.png']
        },
        create: {
          hook: 'createDockerContainer',
          Image: 'v4tech/imagemagick',
          Cmd: ['/bin/sh'],
          AttachStdout: true,
          AttachStderr: true,
          Tty: true
        },
        start: {
          hook: 'runDockerContainerCommand',
          command: 'start'
        }
      },
      after: {
        copyInputImage: {
          hook: 'runDockerContainerCommand',
          command: 'putArchive',
          arguments: [path.join(outputPath, '<%= id %>.tar'), { path: '/tmp' }]
        },
        convert: {
          hook: 'runDockerContainerCommand',
          command: 'exec',
          arguments: {
            Cmd: ['convert', '/tmp/<%= id %>.png', '/tmp/<%= id %>.jpg'],
            AttachStdout: true,
            AttachStderr: true,
            Tty: true
          }
        },
        copyOutputImage: {
          hook: 'runDockerContainerCommand',
          command: 'getArchive',
          arguments: { path: '/tmp/.' }
        },
        destroy: {
          hook: 'runDockerContainerCommand',
          command: 'remove',
          arguments: { force: true }
        },
        untar: {
          cwd: outputPath,
          file: path.join(outputPath, '<%= id %>.tar')
        }
      }
    },
    jobs: {
      before: {
        template: {
          store: 'fs',
          options: {
            workersLimit: 4
          }
        },
        generateId: {},
        createStores: {
          id: 'fs',
          options: {
            path: outputPath,
            storePath: 'store'
          }
        },
        connectDocker: {
          // By default connect via the local Docker socket. Set DOCKER_HOST + DOCKER_PORT
          // to use a TCP daemon instead.
          ...(process.env.DOCKER_HOST
            ? { host: process.env.DOCKER_HOST, port: process.env.DOCKER_PORT || 2375 }
            : { socketPath: process.env.DOCKER_SOCKET || '/var/run/docker.sock' }),
          // Required so that client is forwarded from job to tasks
          clientPath: 'taskTemplate.client'
        }
      },
      after: {
        clearOutputs: {},
        disconnectDocker: { clientPath: 'taskTemplate.client' },
        removeStores: 'fs'
      }
    }
  }
}
