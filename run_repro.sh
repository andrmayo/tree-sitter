#!/usr/bin/env bash

docker build -f ./lib/binding_web/repro/repro.Dockerfile -t ts-leak .
