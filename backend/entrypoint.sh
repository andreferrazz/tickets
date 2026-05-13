#!/bin/sh
set -e

# Migrate before booting. Ecto.Migrator holds an advisory lock, so when
# multiple instances start together only one actually runs the migration
# and the rest wait.
bin/backend eval "Backend.Release.migrate()"

exec bin/backend start
