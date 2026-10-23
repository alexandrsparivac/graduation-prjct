## Practice voice recognition

Practice records audio in the browser and sends it to the private Whisper worker below. The worker uses the open-source model from [openai/whisper](https://github.com/openai/whisper); it does not send recordings to Groq or expose model credentials in the browser.

Install the Whisper requirements and `ffmpeg` on the machine that will run the worker:

```sh
python3 -m venv .venv-whisper
. .venv-whisper/bin/activate
pip install -r whisper-service/requirements.txt
```

Set the same long random `WHISPER_SERVICE_TOKEN` in the main app's `.env` and the worker environment, then start the worker:

```sh
export WHISPER_SERVICE_TOKEN='your-long-random-secret'
python whisper-service/server.py
```

The default `base` model downloads on the first start and stays in memory. To use another multilingual model, set `WHISPER_MODEL` (`tiny`, `base`, `small`, `medium`, or `large`). Set `WHISPER_SERVICE_URL` to the worker's private URL when the app and worker run on separate machines. The worker needs `ffmpeg` and enough memory for the selected model.
