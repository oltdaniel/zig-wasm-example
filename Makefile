.PHONY: default server

default:
	zig build

server:
	python -m http.server -d www 8000