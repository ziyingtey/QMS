# Wait-time ML sidecar

C# cannot load `wait_model.joblib`. Run this before / alongside the API:

```bash
cd ml
.venv/bin/python serve_wait_model.py --port 5099
```

API config (`MlWait` in appsettings):

- `Enabled`: true
- `BaseUrl`: `http://127.0.0.1:5099`
- `TimeoutMs`: 400

Customer Track ETA order: **ML → CounterSimulation → Formula**.

Retrain transitional model:

```bash
.venv/bin/python generate_seed_data.py
.venv/bin/python prepare_transitional_train.py
.venv/bin/python train_wait_model.py --csv data/transitional_train.csv
# then restart sidecar
```
