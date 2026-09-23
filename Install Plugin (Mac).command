#!/usr/bin/env bash
DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
"$DIR/install-plugin.sh"
read -p "Press [Enter] to close..."
