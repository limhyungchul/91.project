// app.js
require('dotenv').config();

const express = require('express');
const path = require('path');
const mongoose = require('mongoose');
const cors = require('cors');

const apiRoutes = require('./api-routes');

const app = express();
const rootPath = __dirname;



/* ===================================================
   1️⃣ 기본 미들웨어
=================================================== */

app.use(cors());

app.use(express.json({
    limit: '10mb'
}));

app.use(express.urlencoded({
    extended: true,
    limit: '10mb'
}));



/* ===================================================
   2️⃣ MongoDB 연결
=================================================== */

mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true
})
    .then(() => {

        console.log("✅ MongoDB 연결 성공");

    })
    .catch(err => {

        console.error("❌ MongoDB 연결 실패:", err);

        process.exit(1);

    });



/* ===================================================
   3️⃣ 요청 로그 (디버그용)
=================================================== */

app.use((req, res, next) => {

    console.log(`${req.method} ${req.url}`);

    next();

});



/* ===================================================
   4️⃣ 루트 페이지
=================================================== */

app.get('/', (req, res) => {

    console.log("루트 접속");

    res.redirect('/static/91.login/loginpage.html');

});



/* ===================================================
   5️⃣ 정적 파일
=================================================== */

app.use('/static', express.static(path.join(rootPath, 'static')));

app.use(express.static(rootPath));



/* ===================================================
   6️⃣ API 라우터
=================================================== */

app.use('/api', apiRoutes);



/* ===================================================
   7️⃣ 404 처리
=================================================== */

app.use((req, res) => {

    res.status(404).json({
        success: false,
        message: "API not found"
    });

});



/* ===================================================
   8️⃣ 서버 에러 처리
=================================================== */

app.use((err, req, res, next) => {

    console.error("서버 에러:", err);

    res.status(500).json({
        success: false,
        message: "서버 내부 오류"
    });

});



/* ===================================================
   9️⃣ 서버 실행
=================================================== */

const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {

    console.log("\n🚀 서버 실행 완료");
    console.log(`🌐 http://localhost:${PORT}`);

});