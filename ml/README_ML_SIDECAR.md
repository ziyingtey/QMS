# Wait-time ML sidecar

C# cannot load `wait_model.joblib`. Run this before / alongside the API:

```bash
cd ml
.venv/bin/python serve_wait_model.py --port 5099
```

The API (`MlSidecarHostedService`) auto-starts this sidecar on boot when `MlWait:Enabled` is true and the port is free. Manual start is still fine if you prefer a second terminal.


API config (`MlWait` in appsettings):

- `Enabled`: true
- `BaseUrl`: `http://127.0.0.1:5099`
- `TimeoutMs`: 400

Customer Track ETA order: **ML → CounterSimulation → Formula**.

## Training data contract (v3)

- **Target** `WaitingMinutes` = `CalledAt - QueueEligibleAt` (until a counter calls the ticket, not until service starts).
  Live: `ML_TRAINING_DATA.ActualWaitingMinutes` is filled at Call Next; `ServingStartedAt` is kept for reference only.
- **QueueEligibleAt**: walk-in = ticket time; online = `max(CheckedInAt, SlotStart - OnlineEarlyCallMinutes)` (set at check-in).
- **Services / prefixes / branches** in `generate_seed_data.py` and the notebook mirror the production seed scripts in
  `database/` (A Account Opening, D Deposit, W Withdraw, L Loan, C Credit Card, F Fixed Deposit, I Investment,
  B Bancassurance, T ATM/CDM, O Online Banking, S Business Banking, R Remittance, Q Customer Service; 60-min slots, 09:30-16:00).
- **Manager settings** are randomized per branch-day like in production: `OnlineEarlyCallMinutes` from {0,5,10,15,20,30} and
  `OnlineSlotsPerSlot` (per service) from 2..8; overflow online bookings become walk-ins. Live sends the configured
  `ServiceType.OnlineSlotsPerSlot`.
- The simulation cells in `QMS_WaitTime_ML_Pipeline.ipynb` are verbatim copies of the `# >>> NB-CELL` regions in
  `generate_seed_data.py`; edit both together.
- SQL training (`train_wait_model.py --connection-string ...`) only uses rows with `FeatureSchemaVersion = 'v3'`.
  Existing databases need `database/migrations/004_ml_training_v3_features.sql`.

Retrain:

```bash
.venv/bin/python generate_seed_data.py
.venv/bin/python train_wait_model.py --csv data/wait_training.csv
# or run QMS_WaitTime_ML_Pipeline.ipynb in Colab and copy wait_model.joblib here
# then restart the sidecar (or the API, which auto-starts it)
```
