import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { getMyRiders } from '../api/teamLeadersApi';
import { useApi } from '../hooks/useApi';
import { useWeek } from '../context/WeekContext';
import PageHeader from '../components/layout/PageHeader';
import EmptyState from '../components/feedback/EmptyState';
import ErrorState from '../components/feedback/ErrorState';
import LoadingSkeleton from '../components/feedback/LoadingSkeleton';
import Icon from '../components/ui/Icon';
import Pagination from '../components/ui/Pagination';
import MyRidersTable from '../features/teamLeaders/MyRidersTable';

const PAGE_SIZE = 20;
const SEARCH_DELAY_MS = 300;

// A team leader's home page: the riders assigned to them. Search and page live in the URL.
export default function MyRidersPage() {
    const [searchParams, setSearchParams] = useSearchParams();
    const search = searchParams.get('search') ?? '';
    const page = Math.max(Number(searchParams.get('page')) || 1, 1);

    const { refreshKey } = useWeek();
    const [searchInput, setSearchInput] = useState(search);

    const list = useApi(
        options => getMyRiders({ search, page, limit: PAGE_SIZE }, options),
        [search, page, refreshKey]
    );

    // Merges changes into the URL; an empty value removes the key.
    function updateParams(changes) {
        setSearchParams(current => {
            const next = new URLSearchParams(current);

            for (const [key, value] of Object.entries(changes)) {
                if (value === undefined || value === '' || value === null) {
                    next.delete(key);
                } else {
                    next.set(key, value);
                }
            }

            return next;
        }, { replace: true });
    }

    // Push the typed search into the URL once the user pauses.
    useEffect(() => {
        if (searchInput.trim() === search) {
            return undefined;
        }

        const timer = setTimeout(() => updateParams({ search: searchInput.trim(), page: undefined }), SEARCH_DELAY_MS);
        return () => clearTimeout(timer);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [searchInput, search]);

    return (
        <>
            <PageHeader
                title="My Riders"
                subtitle="Riders assigned to you. Riders who owe money are listed first."
            />

            <div className="search-box">
                <Icon name="search" />
                <input
                    type="search"
                    value={searchInput}
                    onChange={event => setSearchInput(event.target.value)}
                    placeholder="Search by name, phone, or rider ID…"
                    aria-label="Search my riders"
                />
            </div>

            {list.loading && <LoadingSkeleton variant="table" rows={8} />}

            {list.error && <ErrorState title="Could not load your riders" error={list.error} onRetry={list.retry} />}

            {list.data && (
                <section className="card card--flush">
                    {list.data.riders.length ? (
                        <>
                            <MyRidersTable riders={list.data.riders} />
                            <Pagination
                                {...list.data.pagination}
                                onPageChange={next => updateParams({ page: next > 1 ? next : undefined })}
                            />
                        </>
                    ) : (
                        <div className="card__empty">
                            <EmptyState
                                message={search
                                    ? `None of your riders match “${search}”.`
                                    : 'No riders are assigned to you yet. Ask an admin to assign them.'}
                            />
                        </div>
                    )}
                </section>
            )}
        </>
    );
}
