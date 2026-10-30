import { Fragment } from 'react';
import { Link } from 'react-router-dom';

import Icon from '../ui/Icon';

// Optional breadcrumb trail, then title, subtitle and action buttons.
// breadcrumbs: [{ label, to? }] — the last item is the current page.
export default function PageHeader({ title, subtitle, actions, breadcrumbs }) {
    return (
        <div className="page-header">
            <div>
                {breadcrumbs && (
                    <nav className="breadcrumbs" aria-label="Breadcrumb">
                        <Link to="/" aria-label="Home">
                            <Icon name="home" size={15} />
                        </Link>
                        {breadcrumbs.map((crumb, index) => (
                            <Fragment key={crumb.label}>
                                <Icon name="chevronRight" size={13} />
                                {crumb.to && index < breadcrumbs.length - 1
                                    ? <Link to={crumb.to}>{crumb.label}</Link>
                                    : <span aria-current="page">{crumb.label}</span>}
                            </Fragment>
                        ))}
                    </nav>
                )}
                <h2 className="page-header__title">{title}</h2>
                {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="page-header__actions">{actions}</div>}
        </div>
    );
}
