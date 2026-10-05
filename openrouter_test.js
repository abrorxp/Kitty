const axios = require('axios');
(async () => {
  try {
    const res = await axios.post('https://openrouter.ai/v1/chat/completions', {
      model: 'openai/gpt-oss-120b:free',
      messages: [{ role: 'user', content: 'hello' }]
    }, {
      headers: { 'Content-Type': 'application/json' }
    });
    console.log('status', res.status, res.headers['content-type']);
    console.log(typeof res.data === 'string' ? res.data.slice(0, 200) : JSON.stringify(res.data).slice(0, 200));
  } catch (e) {
    if (e.response) {
      console.log('status', e.response.status, e.response.headers['content-type']);
      console.log(typeof e.response.data === 'string' ? e.response.data.slice(0, 200) : JSON.stringify(e.response.data).slice(0, 200));
    } else {
      console.error('err', e.message);
    }
  }
})();
