import { useState } from 'react';
import { useParams } from 'react-router-dom';

import { getMockPayment, swipeToPay } from '../api/escalationsApi';
import { useApi } from '../hooks/useApi';
import { formatINR } from '../utils/formatCurrency';

// Public stand-in for the rider app's payment screen, opened from an escalation's payment link.
// Swiping to the end pays: the API then sends itself a signed webhook, as a real payment would.
// Served only while the API has ENABLE_MOCK_PAY=true.
export default function MockPayPage() {
    const { token } = useParams();
    const payment = useApi(options => getMockPayment(token, options), [token]);
    const [swipe, setSwipe] = useState(0);
    const [busy, setBusy] = useState(false);
    const [paid, setPaid] = useState(false);
    const [error, setError] = useState(null);

    async function pay() {
        setBusy(true);
        setError(null);

        try {
            const result = await swipeToPay(token);

            // A webhook that changed nothing (e.g. paid a moment ago) still answers 200.
            if (result.applied) {
                setPaid(true);
            } else {
                setError(result.reason ?? 'The payment was not applied');
                payment.retry();
            }
        } catch (payError) {
            setError(payError.message);
            setSwipe(0);
        } finally {
            setBusy(false);
        }
    }

    function handleSwipe(event) {
        const value = Number(event.target.value);
        setSwipe(value);

        if (value === 100 && !busy) {
            pay();
        }
    }

    // Letting go before the end slides it back.
    function handleRelease() {
        if (swipe < 100) {
            setSwipe(0);
        }
    }

    const data = payment.data;

    return (
        <main className="login-page">
            <section className="card login-card mock-pay">
                <div className="login-card__brand">
                    <span className="sidebar__logo">R</span>
                    Rider App
                </div>

                {payment.loading && <p className="muted">Loading payment…</p>}

                {payment.error && (
                    <p className="form-alert" role="alert">
                        {payment.error.status === 404 ? 'This payment link does not exist.' : payment.error.message}
                    </p>
                )}

                {data && (
                    <>
                        <p className="muted">Amount due for {data.riderName}</p>
                        <p className="mock-pay__amount">{formatINR(data.amount)}</p>

                        {paid ? (
                            <p className="mock-pay__done" role="status">Payment received. Your bike will be unlocked.</p>
                        ) : !data.payable ? (
                            <p className="form-alert" role="alert">This link can no longer be paid ({data.status}).</p>
                        ) : (
                            <>
                                {error && <p className="form-alert" role="alert">{error}</p>}
                                <label className="mock-pay__swipe">
                                    <span>{busy ? 'Paying…' : 'Swipe to pay →'}</span>
                                    <input
                                        type="range"
                                        min="0"
                                        max="100"
                                        value={swipe}
                                        disabled={busy}
                                        onChange={handleSwipe}
                                        onPointerUp={handleRelease}
                                        onKeyUp={handleRelease}
                                        aria-label="Swipe to pay"
                                    />
                                </label>
                            </>
                        )}
                    </>
                )}
            </section>
        </main>
    );
}
