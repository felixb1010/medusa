curl -X POST 'https://medusa-url.com/admin/collections' \
-H 'Authorization: Bearer {api_token}' \
-H 'Content-Type: application/json' \
--data-raw '{
    "title": "New Collection"
}'