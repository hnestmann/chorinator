# Chorinator
Web App to keep track of recurring chores such as exercises or watering plants. The idea is stolen ... uhm inspired by a video posted on [Thinmatrix's youtube channel](https://youtu.be/Q1oV6sgLBHg?t=423). I can't wait to get the city builder.

The main thing I wanted to accomplish is getting myself educated on latest web standards and what you can accomplish without a big frontend framework and a thin server stack.

A few things that are deemed important to the application 
- Offline First
- No Compilation steps
- Fast
- Bring data close to the user

## How to
Add your mongo URI to /services/chores/config.json and start frontend and services like so
``` 
$ cd frontend && npm install && npm run start-dev
$ cd services/chores && npm install && npm run start-dev
```
(This is gonna be extended)

## Credits
- Thinmatrix for the idea https://www.youtube.com/user/ThinMatrix
- Brad Traversy for the web component crash course https://www.youtube.com/user/TechGuyWeb
- Angela Delise for the grid and card layout https://www.youtube.com/channel/UC_TjoSnaI3CTgIgmSn3rruA
- Node js for the server stack https://nodejs.org/en/
- Koa for the web for the web framework I am using https://koajs.com/
- Mongo DB for the storage engine https://www.mongodb.com/
- davidshimjs for the awesome qr code library https://github.com/davidshimjs/
- Benson Ruan for the camera lib https://github.com/bensonruan/
