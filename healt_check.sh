#!/bin/bash

Status=$(curl -s -o /dev/null -w "%{http_code}" http://localhost/api/health)

if [ "$Status" -eq 200 ]; then
    echo "Health check passed"
    exit 0
else
    echo "Health check failed with status code: $Status"
    exit 1
fi