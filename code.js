// 定数
const LINE_URL = 'https://api.line.me/v2/bot/message/reply';
const LINE_CHANNEL_ACCESS_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');
const GEMINI_API_KEY = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=' + GEMINI_API_KEY;
const SPREADSHEET_ID = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID');

// LINE Messaging APIからリクエストを処理する
function doPost(e) {
  try {
    const requestBody = JSON.parse(e.postData.contents);
    // イベントオブジェクトを取得、最初のイベントだけ処理する
    const event = requestBody.events[0];

  // ... (イベントのreplyTokenを取得)
    const replyToken = event.replyToken;

  // --- 画像かテキストかで処理を振り分ける ---
  if (event.type === 'message' && event.message.type === 'image') {
    // 画像処理のロジックへ
  } else if (event.type === 'message' && event.message.type === 'text') {
    // テキスト処理のロジックへ
  } else {
    // それ以外の場合の応答
  }
  }
  catch (error) {
    Logger.log('Error: ' + error.message);
    return ContentService.createTextOutput(JSON.stringify({ 'status': 'error', 'message': error.message })).setMimeType(ContentService.MimeType.JSON);
  }
}

// 画像メッセージを処理する関数
function getLineContent(messageId) {
  const url = `https://api.line.me/v2/bot/message/${messageId}/content`;
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
  try {
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
      'config':{
        "responsMimeType":"application/json",
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
      return jsonResponse.candidates[0].content.parts[0].text.trim();
    } else {
      Logger.log('Gemini API呼び出しエラー (' + responseCode + '): ' + response.getContentText());
      return 'Gemini APIでの画像解析中にエラーが発生しました。';
    }
    
  } catch(error) {
    Logger.log('Gemini処理エラー: ' + error.toString());
    return '画像処理中に予期せぬエラーが発生しました。';
  }
}

// Google Spreadsheetにデータを保存する関数


// LINE Messaging APIに応答を送信する関数