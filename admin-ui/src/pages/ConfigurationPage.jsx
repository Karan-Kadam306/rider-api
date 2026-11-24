import { useState } from 'react';

import {
    addDepositAmount,
    addPostpaidRate,
    createPrepaidPack,
    getPricing,
    removeDepositAmount,
    removePostpaidRate,
    updatePrepaidPack
} from '../api/pricingApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import { useToast } from '../context/ToastContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import CurrencyText from '../components/ui/CurrencyText';
import Icon from '../components/ui/Icon';
import StatCard from '../components/ui/StatCard';
import PriceHistoryTable from '../features/configuration/PriceHistoryTable';
import PacksTable from '../features/configuration/PacksTable';
import PriceChangeDialog from '../features/configuration/PriceChangeDialog';
import PackFormDialog from '../features/configuration/PackFormDialog';
import { formatDate } from '../utils/formatDate';

const RATE_FIELDS = [
    { name: 'rentalPerDay', label: 'Rental per day (₹)' },
    { name: 'energyPerKm', label: 'Energy per KM (₹)', allowZero: true }
];
const DEPOSIT_FIELDS = [{ name: 'amount', label: 'Deposit (₹)' }];

// Admins set what riders pay: postpaid rates, the refundable deposit and the prepaid packs.
// A new rate or deposit is scheduled from a date; past values stay, so billed weeks never change.
export default function ConfigurationPage() {
    const { refreshKey } = useWeek();
    const showToast = useToast();

    // Bumped after a change on this page to refetch; refreshKey does the same for the top bar's Refresh.
    const [reloadKey, setReloadKey] = useState(0);
    // null = closed, 'rate', 'deposit', or { pack } (pack null to add)
    const [dialog, setDialog] = useState(null);

    const pricing = useApi(options => getPricing(options), [refreshKey, reloadKey]);
    const data = pricing.data;

    const reload = () => setReloadKey(key => key + 1);
    const close = () => setDialog(null);

    // Errors are not caught here: they reject back to the dialog, which shows them.
    async function handleAddRate(values) {
        await addPostpaidRate(values);
        showToast({ message: `New postpaid rate starts on ${formatDate(values.effectiveFrom)}` });
        close();
        reload();
    }

    async function handleAddDeposit(values) {
        await addDepositAmount(values);
        showToast({ message: `New deposit amount starts on ${formatDate(values.effectiveFrom)}` });
        close();
        reload();
    }

    async function handleSavePack(values) {
        if (dialog.pack) {
            await updatePrepaidPack(dialog.pack.packId, values);
            showToast({ message: `${values.name} updated` });
        } else {
            await createPrepaidPack(values);
            showToast({ message: `${values.name} added` });
        }

        close();
        reload();
    }

    // Removing and activating are one click; failures show as a toast.
    async function runAction(action, message) {
        try {
            await action();
            showToast({ message });
            reload();
        } catch (error) {
            showToast({ type: 'error', message: error.message });
        }
    }

    return (
        <>
            <PageHeader
                breadcrumbs={[{ label: 'Administration' }, { label: 'Configuration' }]}
                title="Configuration"
                subtitle="What riders pay. New prices start on a date you choose; weeks already closed or paid out never change."
            />

            {pricing.loading && <LoadingSkeleton variant="table" rows={6} />}

            {pricing.error && <ErrorState title="Could not load prices" error={pricing.error} onRetry={pricing.retry} />}

            {data && (
                <>
                    <div className="card-grid card-grid--compact">
                        <StatCard
                            label="Postpaid rental"
                            value={<CurrencyText value={data.currentPostpaidRate.rentalPerDay} />}
                            subText="Per day with a bike"
                        />
                        <StatCard
                            label="Postpaid energy"
                            value={<CurrencyText value={data.currentPostpaidRate.energyPerKm} />}
                            subText="Per KM ridden"
                        />
                        <StatCard
                            label="Deposit"
                            value={data.currentDeposit ? <CurrencyText value={data.currentDeposit.amount} /> : 'Not set'}
                            subText="Refundable, paid once by every new rider"
                        />
                    </div>

                    <section className="card card--flush">
                        <div className="panel__header payout-section__header">
                            <h3 className="panel__title">Postpaid rates</h3>
                            <button type="button" className="button button--secondary" onClick={() => setDialog('rate')}>
                                <Icon name="plus" size={16} />
                                Schedule new rate
                            </button>
                        </div>
                        <PriceHistoryTable
                            rows={data.postpaidRates}
                            idKey="rateId"
                            amounts={[{ key: 'rentalPerDay', label: 'Rental / day' }, { key: 'energyPerKm', label: 'Energy / KM' }]}
                            currentId={data.currentPostpaidRate.rateId}
                            today={data.today}
                            onRemove={rate => runAction(() => removePostpaidRate(rate.rateId), 'Scheduled rate removed')}
                        />
                    </section>

                    <section className="card card--flush">
                        <div className="panel__header payout-section__header">
                            <h3 className="panel__title">Deposit</h3>
                            <button type="button" className="button button--secondary" onClick={() => setDialog('deposit')}>
                                <Icon name="plus" size={16} />
                                Schedule new amount
                            </button>
                        </div>
                        {data.depositAmounts.length ? (
                            <PriceHistoryTable
                                rows={data.depositAmounts}
                                idKey="depositId"
                                amounts={[{ key: 'amount', label: 'Amount' }]}
                                currentId={data.currentDeposit?.depositId}
                                today={data.today}
                                onRemove={deposit => runAction(
                                    () => removeDepositAmount(deposit.depositId),
                                    'Scheduled deposit amount removed'
                                )}
                            />
                        ) : (
                            <div className="card__empty">
                                <EmptyState message="No deposit amount yet. Set one before riders start onboarding." />
                            </div>
                        )}
                    </section>

                    <section className="card card--flush">
                        <div className="panel__header payout-section__header">
                            <h3 className="panel__title">Prepaid packs</h3>
                            <button type="button" className="button button--secondary" onClick={() => setDialog({ pack: null })}>
                                <Icon name="plus" size={16} />
                                Add pack
                            </button>
                        </div>
                        {data.prepaidPacks.length ? (
                            <PacksTable
                                packs={data.prepaidPacks}
                                onEdit={pack => setDialog({ pack })}
                                onToggleActive={pack => runAction(
                                    () => updatePrepaidPack(pack.packId, { isActive: !pack.isActive }),
                                    `${pack.name} is now ${pack.isActive ? 'inactive' : 'active'}`
                                )}
                            />
                        ) : (
                            <div className="card__empty">
                                <EmptyState message="No prepaid packs yet. Add a weekly pack, then any KM top-ups." />
                            </div>
                        )}
                    </section>
                </>
            )}

            {dialog === 'rate' && (
                <PriceChangeDialog
                    title="Schedule new postpaid rate"
                    note="Applies to every postpaid rider from this date. It must start after the last closed or paid-out week."
                    fields={RATE_FIELDS}
                    onSubmit={handleAddRate}
                    onClose={close}
                />
            )}

            {dialog === 'deposit' && (
                <PriceChangeDialog
                    title="Schedule new deposit amount"
                    note="Riders who pay from this date pay the new amount. It cannot start in the past."
                    fields={DEPOSIT_FIELDS}
                    onSubmit={handleAddDeposit}
                    onClose={close}
                />
            )}

            {dialog?.pack !== undefined && (
                <PackFormDialog pack={dialog.pack} onSubmit={handleSavePack} onClose={close} />
            )}
        </>
    );
}
