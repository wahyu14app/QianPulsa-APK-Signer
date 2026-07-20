APP_NAME="Test'App"
SAFE_DNAME_APP=$(echo "$APP_NAME" | tr -d ',"\'')
echo $SAFE_DNAME_APP
