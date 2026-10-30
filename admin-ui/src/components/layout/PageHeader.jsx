// Title, subtitle and optional action buttons at the top of a page.
export default function PageHeader({ title, subtitle, actions }) {
    return (
        <div className="page-header">
            <div>
                <h2 className="page-header__title">{title}</h2>
                {subtitle && <p className="page-header__subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="page-header__actions">{actions}</div>}
        </div>
    );
}
