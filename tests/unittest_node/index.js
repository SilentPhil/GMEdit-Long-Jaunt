const express = require('express')
const app = express()
const port = 3000

app.use(express.static('public'))
app.use('/api', express.static('../../bin/resources/app/api'))
app.use('/ace', express.static('../../bin/resources/app/ace/src-noconflict'))

app.listen(port, () => {
	console.log(`Webserver listening at http://localhost:${port}`)
})
