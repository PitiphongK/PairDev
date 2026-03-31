FROM redis:latest

EXPOSE 6379

CMD ["redis-server", "--appendonly", "yes"]