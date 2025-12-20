// 定数
const LINE_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY;
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

// LINE Messaging APIからリクエストを処理する
function doPost(e) {
    // エラーハンドリング用にreplyTokenを初期化
    let replyToken = null;
  try {
    const requestBody = JSON.parse(e.postData.contents);
    // イベントオブジェクトを取得、最初のイベントだけ処理する
    const event = requestBody.events[0];

  // ... (イベントのreplyTokenを取得)
    replyToken = event.replyToken;

  // --- 画像かテキストかで処理を振り分ける ---
  if (event.type === 'message' && event.message.type === 'image') {
    // 画像処理のロジックへ
    const messageId = event.message.id;
    // LINE Content APIから画像を取得
    const imageBlob = getLineContent(messageId);
    // Gemini APIで画像を処理し、JSON形式の応答を取得
    const jsonData = processImageWithGemini(imageBlob);
    // スプレッドシートにデータを保存
    saveDataToSpreadsheet(jsonData);
    // ユーザーに応答を送信
    replyToLine(replyToken, 'レシートの情報を記録しました:\n' +
      `日付: ${jsonData.Date}\n` +
      `合計金額: ${jsonData.TotalAmount}\n` +
      `店舗名: ${jsonData.ShopName}\n` +
      `カテゴリ: ${jsonData.Category}\n` +
      `メモ: ${jsonData.Memo}`);
  } else if (event.type === 'message' && event.message.type === 'text') {
    // テキスト処理のロジックへ
    // 「今月」とメッセージが含まれている場合、今月の月別集計を返す
    const userMessage = event.message.text;
    if (userMessage.includes('今月')) {
      const now = new Date();
      const year = now.getFullYear();
      const month = now.getMonth() + 1; // 月は0から始まるため+1
      const summary = getMonthlySummary(year, month);
      const responseMessage = `【${year}年${month}月の集計】\n` +
        `総合計: ${summary.total}円\n` +
        `食費: ${summary.foodExpenses}円\n` +
        `外食: ${summary.diningOut}円\n` +
        `日用品: ${summary.dailyNecessities}円\n` +
        `その他: ${summary.others}円`;
      replyToLine(replyToken, responseMessage);
      return ContentService
      .createTextOutput(JSON.stringify({status: 'ok'}))
      .setMimeType(ContentService.MimeType.JSON);
    } else if (userMessage.includes('先月')) {
        // 「先月」とメッセージが含まれている場合、先月の月別集計を返す
        const now = new Date();
        let year = now.getFullYear();
        let month = now.getMonth(); // 先月
        
        if (month === 0) { // 1月の場合、先月は前年の12月
            month = 12;
            year -= 1;
        }
        
        const summary = getMonthlySummary(year, month);
        const responseMessage = `【${year}年${month}月の集計】\n` +
          `総合計: ${summary.total}円\n` +
          `食費: ${summary.foodExpenses}円\n` +
          `外食: ${summary.diningOut}円\n` +
          `日用品: ${summary.dailyNecessities}円\n` +
          `その他: ${summary.others}円`;
        replyToLine(replyToken, responseMessage);
        return ContentService
        .createTextOutput(JSON.stringify({status: 'ok'}))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (userMessage.includes('直近')) {
        // 「直近」とメッセージが含まれている場合、直近3件のデータを返す
        const recentEntries = getRecentEntries(3);
        if (recentEntries.length === 0) {
            replyToLine(replyToken, '記録されたデータがありません。');
        }   else {
            let responseMessage = '【直近3件の記録】\n';
            recentEntries.forEach((entry, index) => {
                const date = entry[0] ? Utilities.formatDate(new Date(entry[0]), Session.getScriptTimeZone(), 'yyyy-MM-dd') : '不明';
                const amount = entry[1] || 0;
                const shopName = entry[2] || '不明';
                const category = entry[3] || '不明';
                const memo = entry[4] || 'なし';
                responseMessage += `${index + 1}. 日付: ${date}, 金額: ${amount}円, 店舗: ${shopName}, カテゴリ: ${category}, メモ: ${memo}\n`;
            });
            replyToLine(replyToken, responseMessage);
        }
        return ContentService
        .createTextOutput(JSON.stringify({status: 'ok'}))
        .setMimeType(ContentService.MimeType.JSON);
    } else if (userMessage.includes('説明')) {
        // 「説明」とメッセージが含まれている場合、サービスの説明を返す
        const explanation = `この家計簿Botは、レシートの画像を送信すると自動で情報を抽出し、Googleスプレッドシートに記録します。
        下記のコマンドで支出集計も可能です:
        「今月」:今月の支出集計を返信します
        「先月」:先月の支出集計を返信します
        「直近」:直近3件の記録を返信します
        ぜひご活用ください！`;
        replyToLine(replyToken, explanation);
    }   else if (userMessage.includes('URL')){
        // 「URL」とメッセージが含まれている場合、スプレッドシートのURLを返す
        const sheetUrl = `スプレッドシートのURLはこちらです:\nhttps://docs.google.com/spreadsheets/d/${SPREADSHEET_ID}`;
        replyToLine(replyToken, sheetUrl);
    }else {
        // それ以外のテキストメッセージへは提携文を返す
        replyToLine(replyToken, '「今月」または「先月」とメッセージに含めて送信すると、支出集計をお知らせします！');
    }
  } else {
    // それ以外の場合の応答
    replyToLine(replyToken, '画像またはテキストメッセージだけです！');
  }
  return ContentService
  .createTextOutput(JSON.stringify({status: 'ok'}))
  .setMimeType(ContentService.MimeType.JSON);
  }
  catch (error) {
    Logger.log('Error: ' + error.message);
    if (replyToken){
        replyToLine(replyToken, 'エラーが発生しました: ' + error.message);
    }
    return ContentService.createTextOutput(JSON.stringify({ 'status': 'error', 'message': error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 画像メッセージを処理する関数
function getLineContent(messageId) {
  const url = `https://api-data.line.me/v2/bot/message/${messageId}/content`;
  const options = {
    'method': 'get',
    'headers': {
      'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
    },
    'muteHttpExceptions': true
  };
  
  const response = UrlFetchApp.fetch(url, options);
  
  if (response.getResponseCode() === 200) {
    return response.getBlob();
  } else {
    Logger.log('LINE Content APIからの取得に失敗: ' + response.getContentText());
    throw new Error('画像コンテンツの取得に失敗しました。');
  }
}

// Gemini APIを呼び出してJSON形式の応答を取得する関数
function processImageWithGemini(imageBlob) {
     // Base64エンコード
    const base64Image = Utilities.base64Encode(imageBlob.getBytes());
    
    // 画像を解析するためのプロンプト
    const prompt = `あなたはレシートの画像から情報を抽出するプロフェッショナルです。
添付された画像を分析し、分析結果をAPI設定で指定されたJSONスキーマで出力してください。
- "Date": レシートに記載されている購入日付 (YYYY-MM-DD形式)。記載されていない場合、読み取れない場合は空文字列("")で構いません。
- "TotalAmount": レシートに記載されている税込の合計金額 (数値)。
- "ShopName": レシートに記載されている店舗名（スーパー名、店名など）。
- "Category": 購入品目のカテゴリを「食費・外食・日用品・その他」のうち最も近いもの。 食費はスーパーや食材店などの食料品購入、外食はレストランやカフェなどでの飲食、日用品は生活必需品の購入、その他は上記以外のカテゴリを指す。
- "Memo": レシートにトイレットペーパー、ティッシュペーパー、衣類用洗剤、衣類用柔軟剤、食器用洗剤が含まれている場合、それぞれ「トイレットペーパー購入」、「ティッシュ購入」、「衣類用洗剤購入」、「柔軟剤購入」、「食器用洗剤購入」と出力し、含まれていない場合は「なし」と出力。複数当てはまる場合はカンマ区切りで全て出力する。
 
分析の際は、特に "TotalAmount" と "ShopName" の抽出精度を最大限に高めてください。`;

    
    // APIリクエストのボディを作成
    const requestBody = {
      'contents': [
        {
          'parts': [
            {
              'inlineData': {
                'mimeType': imageBlob.getContentType(), // MIMEタイプを設定 (例: 'image/jpeg')
                'data': base64Image
              }
            },
            {
              'text': prompt
            }
          ]
        }
      ],
      // configで応答形式をJSONに指定する
      'generationConfig':{
        "responseMimeType":"application/json",
        "responseSchema":{
            "type":"OBJECT",
            "properties":{
                "Date":{
                    "type":"STRING",
                    "description":"画像のレシートから読み取れる購入日付をYYYY-MM-DD形式で出力する"
                },
                "TotalAmount":{
                    "type":"NUMBER",
                    "description":"画像のレシートから読み取れる税込の合計金額を数値で出力する"
                },
                "ShopName":{
                    "type":"STRING",
                    "description":"画像のレシートから読み取れる店舗名（スーパー名、店名など）を出力する"
                },
                "Category":{
                    "type":"STRING",
                    "description":"画像のレシートから読み取れる購入品目のカテゴリを、「食費・外食・日用品・その他」のうち最も近いものを出力する。食費はスーパーや食材店などの食料品購入、外食はレストランやカフェなどでの飲食、日用品は生活必需品の購入、その他は上記以外のカテゴリを指す"
                },
                "Memo":{
                    "type":"STRING",
                    "description":"レシートから、トイレットペーパーが含まれていれば「トイレットペーパー購入」、ティッシュペーパーが含まれていれば「ティッシュ購入」、衣類用洗剤が含まれていれば「衣類用洗剤購入」、衣類用柔軟剤が含まれていれば「柔軟剤購入」、食器用洗剤が含まれていれば「食器用洗剤購入」、特に含まれていなければ「なし」と出力する。複数当てはまる場合は、カンマ区切りで全て出力する"
                }
            },
            "required":["Date","TotalAmount","ShopName","Category","Memo"]
        }   
      }
    };

    const options = {
      'method': 'post',
      'headers': {
        'Content-Type': 'application/json',
      },
      'payload': JSON.stringify(requestBody),
      'muteHttpExceptions': true
    };
    
    const response = UrlFetchApp.fetch(GEMINI_URL, options);
    const responseCode = response.getResponseCode();
    
    if (responseCode === 200) {
      const jsonResponse = JSON.parse(response.getContentText());
      // 応答からテキストを抽出、空白を消してJSONとして返す
      // JSON形式でなかったらエラーを投げる
      try {
        const jsondata = JSON.parse(jsonResponse.candidates[0].content.parts[0].text.trim());
        return jsondata;
        
      }
        catch (error) {
        Logger.log('Gemini APIの応答がJSON形式ではありません: ' + jsonResponse.candidates[0].content.parts[0].text);
        throw new Error('Gemini APIの応答がJSON形式ではありません。');
      }
    } else {
      Logger.log('Gemini API呼び出しエラー (' + responseCode + '): ' + response.getContentText());
      throw new Error('Gemini APIでの画像解析中にエラーが発生しました。') ;
    }
}

// Google Spreadsheetにデータを保存する関数
function saveDataToSpreadsheet(data) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();

    // 各データを取得、データ型を変更
    const date = data.Date ? new Date(data.Date) : null;
    const totalAmount = data.TotalAmount ? Number(data.TotalAmount) : 0;
    const shopName = data.ShopName || '';
    const category = data.Category || '';
    const memo = data.Memo || '';
    
    // スプレッドシートにデータを追加
    try {
      sheet.appendRow([date, totalAmount, shopName, category, memo]);
    } catch (error) {
      Logger.log('スプレッドシートへのデータ保存エラー: ' + error.message);
      throw new Error('スプレッドシートへのデータ保存に失敗しました。');
    }
    
}

// LINE Messaging APIに応答を送信する関数
function replyToLine(replyToken, messageText) {
  const payload = {
    'replyToken': replyToken,
    'messages': [
      {
        'type': 'text',
        'text': messageText
      }
    ]
  };
  
  const options = {
    'method': 'post',
    'headers': {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer ' + LINE_CHANNEL_ACCESS_TOKEN
    },
    'payload': JSON.stringify(payload),
    'muteHttpExceptions': true
  };
  
  const response = UrlFetchApp.fetch(LINE_URL, options);
  
  if (response.getResponseCode() !== 200) {
    Logger.log('LINE Messaging APIへの応答に失敗: ' + response.getContentText());
    throw new Error('LINEへの応答送信に失敗しました。');
  }
}   

// Google Spreadsheetからカテゴリ別に月別集計する関数
function getMonthlySummary(year, month) {
  const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
  //1行目はヘッダーなので2行目以降を取得
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) {
    return {
      total: 0,
      foodExpenses: 0,
      diningOut: 0,
      dailyNecessities: 0,
      others: 0
    };
  }
  const data = sheet.getRange(2, 1, lastRow - 1, 5).getValues();
  
  let total = 0;
    let foodExpenses = 0;
    let diningOut = 0;
    let dailyNecessities = 0;
    let others = 0;
  
  data.forEach(row => {
    const date = row[0];
    const amount = row[1];
    const category = row[3];
    
    if (date instanceof Date && date.getFullYear() === year && (date.getMonth() + 1) === month) {
      total += amount;
      switch (category) {
        case '食費':
          foodExpenses += amount;
          break;
        case '外食':
          diningOut += amount;
          break;
        case '日用品':
          dailyNecessities += amount;
          break;
        case 'その他':
          others += amount;
          break;
      }
    }
    });
  
  return {
    total: total,
    foodExpenses: foodExpenses,
    diningOut: diningOut,
    dailyNecessities: dailyNecessities,
    others: others
  };
}

//直近追加のデータx件を取得する関数
function getRecentEntries(count) {
    const sheet = SpreadsheetApp.openById(SPREADSHEET_ID).getActiveSheet();
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) {
        return [];
    }
    const startRow = Math.max(2, lastRow - count + 1);
    const numRows = lastRow - startRow + 1;
    const data = sheet.getRange(startRow, 1, numRows, 5).getValues();
    return data;
}

