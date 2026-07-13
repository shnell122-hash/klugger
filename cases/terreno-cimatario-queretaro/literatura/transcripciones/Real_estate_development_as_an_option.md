<!-- Transcripcion fiel via Gemini 2.5 Flash. Fuente: Real_estate_development_as_an_option.pdf. finishReason=STOP -->

Journal of Real Estate Finance and Economics, 4: 191-208 (1991)
© 1991 Kluwer Academic Publishers

Real Estate Development as an Option

JOSEPH T. WILLIAMS
Professor of Finance and Urban Land Economics, Faculty of Commerce and Business Administration,
University of British Columbia, 2053 Main Mall, Vancouver, British Columbia V6T 1Z2

Abstract
Subject to legal limitations, the owner of undeveloped real estate can determine both the date and density at which
to develop his property. Alternatively, he can abandon his property. The value of these options depends partly
on the stochastic evolution through time of the operating revenues and construction costs of developed property.
In this paper the option pricing problem is solved analytically and numerically for the optimal data and density
of development, the optimal date of abandonment, and the resulting market values of the developed and undeveloped
properties.

Keywords: Development, option.

The option to develop real estate differs in several important ways from put and call op-
tions that investors can trade on organized exchanges. Subject to legal limitations, the owner
of real estate can select the scale or density at which to develop his property. Also, if the
costs of carrying an undeveloped property exceed sufficiently its operating revenues, then
the owner has an incentive to abandon his property. Both options affect the market value
of the undeveloped property. In addition, the value of the undeveloped property depends
upon not only the operating revenues from the developed property but also its costs of
development, both of which can evolve stochastically over time.¹ Compared to problems
with financial options, the owner's options are more complex and are driven by a different
set of stochastic state variables.
In other ways developing real estate is much like exercising an option. Subject to local
zoning regulations, the owner chooses the date at which to develop his property. This op-
tion is more valuable the more uncertain are changes over time in either operating revenues
or construction costs. If investors can trade substitute securities continuously without trans-
action costs in a perfectly competitive capital market, then the owner optimally develops
his property only when development maximizes its market value. For example, maximiz-
ing market value is optimal if the capital market is perfectly competitive and complete,
even if the market for real estate is not. Also, since the option to develop never expires,
the owner optimally exercises his option only when his property's developed value, as deter-
mined by its operating cash inflows, exceeds its costs of development. Depending upon
the values of various parameters, the difference at the optimal exercise point between the
developed value and the construction costs can be considerable. Finally, development is
essentially irrevocable, much like the exercise of financial options. Because buildings are
durable, properties are redeveloped only after prior improvements are rendered economically
or technically obsolete by the passage of time.

192
JOSEPH T. WILLIAMS

Previous papers on this problem include Titman (1985) and Capozza and Sick (1988).²
In Titman's article the development of urban property is recast as a problem in option pric-
ing and then solved using standard techniques. The results have interesting implications
for both the price of urban land and the partial development of urban property, explaining
why, for example, high-rise buildings sometimes abut parking lots. Because the option to
build is valuable, development is optimally deferred until the value of developed property
is greater than its construction cost and, possibly, much greater. In Capozza and Sick's
paper, landowners have the option to convert agricultural land into urban land. Urban land
is priced in a competitive, complete capital market, and the price of agricultural land is
then calculated analytically, using standard techniques in option pricing.³ The optimal point
for converting agricultural into urban land is expressed in terms of the distance from the
city center, using a model of the demand for urban land in which urban rents are linear
in the distance. The results have interesting implications for both the boundary of the ur-
ban area and the income multiplier of agricultural land.
In this paper real estate is valued as an option, and the optimal points at which to aban-
don and to develop property, as well as the optimal density of development are determin-
ed. By assumption, both the operating cash inflows from the developed property and its
costs of development are driven by geometric Wiener processes; the cost of density is Cobb-
Douglas; and the maximum feasible density is determined by zoning restrictions.⁴ In the
initial model undeveloped property has no carrying cost. This initial problem is presented
in Section 1 and solved in Section 2. The analytical solution includes the optimal point
and density of development and the values of developed and undeveloped property. A
stochastic carrying cost for the undeveloped property is then added in Section 3. In this
second situation the option to abandon the property is valuable, and the solution must be
computed numerically. From the perspective of the literature on option pricing, the novel
results relate to the optimal and maximum densities of development. Finally, the main results
are summarized in Section 4. All technical details are relegated to the Appendix.

1. Initial model
An investor owns an undeveloped or underdeveloped property. Subject to legal limitations,
he can choose both the date and density at which to develop his property. The date at which
the owner acquired his property is denoted by $t = 0$. At any time $t \ge 0$, he can develop
his property at some feasible density, scale, or quantity $q$ satisfying $1 \le q \le \delta$, where
$\delta$ denotes the maximum density permitted under zoning regulations. Development is costly.
The cost, $qx_1^\gamma$, depends on the development cost per unit of density $x_1$, measured per unit
of time, and the constant cost of scale $\gamma$. Development at higher densities is more costly
per unit of development: $\gamma > 1$. A property developed at the density $q$ produces the net
cash inflow $qx_2$ per unit of time. With this technology $x_2$ is the cash inflow per unit of
density, also measured per unit of time. By contrast, the undeveloped property has the
corresponding net cash inflow per unit of time, $\beta x_2$. With the constant $0 \le \beta < 1$ and
the subsequent specification of the variable $x_1$, development always increases the property's
net cash inflow.

REAL ESTATE DEVELOPMENT
193

Both the development cost and the net cash inflows evolve stochastically through time.
By assumption, the unit development cost $x_1$ and the unit cash inflows $x_2$ follow geometric
Wiener processes:⁵
$$dx_i = \mu_i x_i dt + \sigma_i x_i dz_i,$$
(1)
where $i = 1, 2$. Each variable $x_i$ has the constant, expected rate of growth $\mu_i$ and the con-
stant variance of the growth rate $\sigma_i^2$, both measured per unit of time. Also, the covariance
$\sigma_{12}$ between the rates of growth in $x_1$ and $x_2$ is constant per unit of time. In this case the
correlation coefficient, $\rho = \sigma_{12}/(\sigma_1 \sigma_2)$, is also constant. With this specification the cash in-
flows from the undeveloped property are almost always positive. Potentially negative cash
inflows are introduced in Section 3.⁶
To value the undeveloped and developed properties, some additional assumptions are
necessary. The riskless rate of interest $\iota$ is constant per unit of time. Also, the stochastic
evolution (1) of both the unit construction cost $x_1$ and the unit cash inflow $x_2$ can be replicated
from portfolios of securities that are traded continuously without transactions costs in the
perfectly competitive capital market. In this market there are two portfolios of traded
securities, $i = 1, 2$, such that the returns on portfolio $i$ are perfectly locally correlated
with the stochastic increments, $dz_i$, in (1). For each portfolio the excess mean return per
unit of standard deviation equals some constant $\lambda_i$. In this case, the risk-adjusted, expected
growth rates: $\nu_i = \mu_i - \lambda_i \sigma_i$, $i = 1, 2$, are also constant.⁷ Assuming that the riskless rate
of interest $\iota$ satisfies the inequalities, $\nu_2 < \iota \le \iota + \nu_2$, then the developed and undeveloped
properties have finite values, as computed below.
Focus first on the developed property. Over time the value of the developed property
evolves in response to the stochastic evolution of its net cash inflow. Conditional on the
current unit cash inflow $x_2$, the developed property has the current price $P(x_2)$. Because
the price $P(x_2)$ is dependent only on the net cash inflow $x_2$ and various parameters, an
instantaneously riskless portfolio can be constructed from the developed property and the
second portfolio of substitute securities, $i = 2$. To preclude riskless arbitrage, this instan-
taneously riskless portfolio must yield the riskless rate $\iota$. Following a now familiar argu-
ment in the literature on option pricing, the price $P(x_2)$ of the developed property must
satisfy the valuation equation:⁸
$$0 = \frac{1}{2} \sigma_2^2 x_2^2 P'' + \nu_2 x_2 P' - \iota P + qx_2,$$
(2)
with the density of development $q$. Because development is irreversible, the differential
equation (2) must be satisfied for all feasible net cash inflows: $x_2 \ge 0$.
The price of the developed property must also satisfy two boundary conditions. If the
developed property has no net cash inflow, $x_1 = 0$, then, with the geometric Wiener proc-
ess (1), it has no net cash inflow from that time forward. Thus, if $x_1 = 0$, then the developed
property is worthless:
$$P(0) = 0.$$
(3)

194
JOSEPH T. WILLIAMS

Also, if the property is to have a well-defined income multiplier, then its price per unit
of cash inflow, $P(x_2)/x_2$, must be bounded above by some constant, $0 < \xi < \infty$:
$$P(x_2) \le \xi x_2.$$
(4)
The valuation equation (2) and boundary conditions, (3) and (4), uniquely determine the
pricing function, $P$, for the developed property.
Over time the value of the undeveloped property is driven by the random evolution of
both the unit construction cost and the unit cash inflow. Conditional on the current values,
$x = (x_1, x_2)$, the undeveloped property has the value $V(x)$. Given the two state variables
$x$, an instantaneously riskless portfolio can be constructed by combining the undeveloped
property with two portfolios of substitute securities, $i = 1, 2$. Again, the returns on the
two portfolios are perfectly locally correlated with the stochastic increments in (1). To
preclude riskless arbitrage, the riskless portfolio must then yield the riskless rate of return
$\iota$. By a familiar argument in option pricing, the value of the undeveloped property $V$ must
then satisfy the valuation equation:⁹
$$0 = \frac{1}{2} \sigma_1^2 x_1^2 V_{11} + \sigma_{12} x_1 x_2 V_{12} + \frac{1}{2} \sigma_2^2 x_2^2 V_{22} + \nu_1 x_1 V_1 + \nu_2 x_2 V_2 - \iota V + \beta x_2.$$
(5)
In (5) $\beta x_2$ is the net cash inflow per unit of time from the undeveloped property. This par-
tial differential equation must be satisfied at all values $x$ for which development of the prop-
erty is not optimal.
The value of the undeveloped property must also satisfy boundary conditions. The first
boundary condition is determined as follows. Given the stochastic specification (1), neither
the unit development cost $x_1$ nor the unit cash inflow $x_2$ can be negative. As a result, the
values of the developed and undeveloped properties must satisfy the inequalities: $0 \le V(x)$
$\le P(x_2)$. In addition, if the developed property has no current cash inflow, $x_2 = 0$, then
it is worthless, as specified in (3). In this case, the undeveloped property must also be
worthless:
$$V(x_1, 0) = 0.$$
(6)
Under the above assumptions, the investor picks both the optimal point and optimal
density of development that maximizes the market value of his undeveloped property. If
the property is developed at the point $x = x^*$ with the density $q = q^*$, then its value $V(x^*)$
must be equal the price of the developed property $P(x_2^*)$ minus the cost of development
$q^* x_1^{*\gamma}$:
$$V(x^*) = P(x_2^*) - q^* x_1^{*\gamma}.$$
(7)
Given (7), development is optimal when $x = x^*$ at $q = q^*$ if and only if
$$V_1(x^*) = -q^{*\gamma}, \quad V_2(x^*) = P'(x_2^*),$$
(8)

REAL ESTATE DEVELOPMENT
195

and
$$q^* = \arg \max_q \{P(x_2^*) - q x_1^{*\gamma}: 1 \le q \le \delta\}.$$
(9)
Condition (8) is the tight-fit or smooth-pasting condition familiar from option pricing.¹⁰
These optimality conditions are verified in the Appendix.

2. Optimal development
Problem (2) through (9) is solved in two steps. First, the pricing function $P$ for the developed
property is determined. Next, using this result, a valuation function for the undeveloped
property is derived. For the developed property the solution is immediate. Subject to the
boundary conditions (3) and (4), the differential equation (2) has the unique solution:
$$P(x_2) = \pi q x_2.$$
(10)
with the constant $\pi = 1/(\iota - \nu_2)$. As indicated in (10), the price of the developed property
is linear in its net cash inflow per unit of time $q x_2$. The price per dollar of cash inflow,
or, equivalently, the income multiplier is decreasing in the interest rate $\iota$, increasing in
the expected growth rate $\mu_2$ of the unit cash inflow $x_2$, and decreasing in the associated
variance $\sigma_2^2$.
Given (10), the value of the undeveloped property can be calculated as follows. Equa-
tions (5) through (10) are satisfied by a valuation function $V$ that is linear homogeneous
in $x$. Accordingly, two ratios are defined: the unit cash inflow relative to the unit construc-
tion cost, $y = x_2/x_1$, and the value of the undeveloped property relative to the unit con-
struction cost, $W(y) = V(x)/x_1$. Also, two parameters are defined:
$$\eta = -\frac{\nu_2 - \nu_1}{\omega^2} - \frac{1}{2} + \sqrt{\left(\frac{\nu_2 - \nu_1}{\omega^2} + \frac{1}{2}\right)^2 + \frac{2\iota - \nu_1}{\omega^2}}, \quad \psi = \frac{\eta}{\eta - 1},$$
with $\omega^2 = \sigma_1^2 - 2\sigma_{12} + \sigma_2^2$. These parameters satisfy the inequalities: $\eta, \psi > 1$.¹¹ With
this transformation problem (5) through (10) simplifies as shown in the Appendix. This
simplified problem has the unique solution specified below.
The solution includes both the optimal development point and optimal density of develop-
ment. Development optimally occurs at the ratio $y^*$:
$$y^* = \begin{cases} \frac{\psi}{ \pi(1 - \beta\psi)} & \text{if } \frac{\psi}{1 - \beta\psi} \le \gamma \\ \frac{\beta\gamma\psi}{\pi(\gamma - \psi)} & \text{if } \frac{\delta\psi}{\delta - \beta\psi} \le \gamma < \frac{\psi}{1 - \beta\psi} \\ \frac{\psi \delta\gamma}{\pi(\delta - \beta\psi)} & \text{if } \gamma < \frac{\delta\psi}{\delta - \beta\psi} \end{cases}$$
(11)

196
JOSEPH T. WILLIAMS

Also, the optimal density of development $q^*$ is¹²
$$q^* = \begin{cases} 1 & \text{if } \frac{\psi}{1 - \beta\psi} \le \gamma \\ \frac{\beta\gamma\psi}{\gamma - \psi} & \text{if } \frac{\delta\psi}{\delta - \beta\psi} \le \gamma < \frac{\psi}{1 - \beta\psi} \\ \delta & \text{if } \gamma < \frac{\delta\psi}{\delta - \beta\psi} \end{cases}$$
(12)
The resulting value of the undeveloped property can be written conditional on the op-
timal ratio and density of development as follows. Measured per unit of the development
cost, $W = V/x_1$, the value of the undeveloped property is
$$W(y) = \beta\pi y + \left[\frac{q^*}{\eta - 1} y^{*\eta}\right] y^{-\eta},$$
(13)
for $0 \le y \le y^*$. This solution is depicted in Figure 1. As indicated, the undeveloped prop-
erty's value relative to its construction cost (13) is increasing and convex in the ratio $y =
x_2/x_1$ and tangent at the optimal development ratio $y^*$ to the development profit per unit
of development cost, $\pi q^* y - q^{*\gamma}$. As a result, the income multiplier, $V/x_2 = W/y$, is in-
creasing in the ratio $y$ of the unit cash inflow relative to the unit construction cost.
This solution has the following comparative statics. An increase in either variance, $\sigma_1^2$
or $\sigma_2^2$, or a decrease in the correlation $\rho$ that does not change the risk-adjusted, expected
growth rates, $\nu_1$ and $\nu_2$, increases the development ratio (11), density (12), and value (13),
whenever $\nu_1 \ge \nu_2$. Under the same conditions, an increase in the riskless rate of interest
$\iota$ has the opposite effect; it decreases (11) through (13). An increase in the cash inflow from
the undeveloped property $\beta x_2$, induced by an increase in the coefficient $\beta$, increases both
the optimal ratio (11) and the optimal density (12). Whenever the maximum density con-
strains development, $q^* = \delta$, an increase in the maximum density $\delta$ decreases the develop-
ment ratio (11) but increases both the optimal density (12) and the optimal ratio (13). Final-
ly, an increase in the cost of scale $\gamma$ decreases the optimal density (12) whenever $0 < q^*$
$< \delta$. All other comparative statics depend, in a complicated fashion, on the values of the
various parameters. The results are summarized in Table 1.
Of these comparative statics, only the parts played by the optimal and maximum den-
sities are novel to the literature on option pricing. Consider first the comparative statics
for the optimal density. Whenever the risk-adjusted, expected growth rate of construction
costs exceeds or equals the corresponding rate for operating cash inflows, $\nu_1 \ge \nu_2$, develop-
ment optimally occurs at higher densities (12) with either more risky properties or lower
interest rates. These results can be understood as follows. The option to develop is more
valuable with a flexible than a fixed density. Given a flexible density, the owner then op-
timally defers development until he realizes a higher ratio of rents relative to construction
costs. This raises both the optimal ratio (11) and the optimal density of development (12),
and thereby the relative value of the undeveloped property (13).

REAL ESTATE DEVELOPMENT
197

[Figure: Value of the underdeveloped property. The graph shows W (value of undeveloped property relative to unit development cost) as a function of y (unit cash inflow relative to unit construction cost). The curve W(y) is increasing and convex, tangent to the line $\pi q^* y - q^{*\gamma}$ at the optimal development ratio $y^*$.]

Figure 1. Value of the underdeveloped property.

Table 1. Comparative statics without abandonment.

| Increase in | Optimal Development Ratio $y^*$ | Optimal Density $q^*$ | Relative Value of Undeveloped Property $W(y)$ | Restrictions on Parameters |
| :---------- | :------------------------------ | :-------------------- | :------------------------------------------ | :------------------------- |
| $\beta$     | +                               | +                     | +                                           |                            |
| $\gamma$    | $-$                             | $-$                   | $-$                                         | $\frac{\delta\psi}{\delta - \beta\psi} < \gamma < \frac{\psi}{1 - \beta\psi}$ |
| $\delta$    | $-$                             | +                     | +                                           | $\gamma < \frac{\delta\psi}{\delta - \beta\psi}$ |
| $\iota$     | $-$                             | $-$                   | $-$                                         | $\nu_1 \ge \nu_2$          |
| $\rho$      | $-$                             | $-$                   | $-$                                         | $\nu_1 \ge \nu_2$          |
| $\sigma_1^2, \sigma_2^2$ | +                               | +                     | +                                           | $\nu_1 \ge \nu_2$          |

The parameters are as follows: $\beta$ cash inflows from the undeveloped relative to the developed property; $\gamma$ development
cost of density; $\delta$ maximum density; $\iota$ riskless rate of interest; $\nu_i$ risk-adjusted, expected growth rates of the unit
construction cost $i = 1$ and the unit cash inflow $i = 2$; $\sigma_i^2$ variance of the growth rates of the unit construction
cost $i = 1$ and the unit cash inflow $i = 2$; and $\rho$ correlation coefficient between the two growth rates.

198
JOSEPH T. WILLIAMS

These results hold if the risk-adjusted, expected growth rate for construction costs $\nu_1$
exceeds or equals the corresponding growth rate for the operating cash inflows $\nu_2$.¹³ This
constraint, $\nu_1 \ge \nu_2$, can be motivated as follows. Over long periods of time, construction
costs affect the aggregate supply of rentable space, which, in turn, largely determines rents
and thereby operating cash inflows. Because buildings are durable, over the long run rents
are constrained above but not below by construction costs. Thus, the expected growth rate
of cash inflows $\mu_2$ is constrained above by the expected growth rate of construction costs
$\mu_1$, while the variance of the growth rate of cash inflows $\sigma_2^2$ is bounded below by the cor-
responding variance of construction costs $\sigma_1^2$.
When zoning restrictions are binding, the maximum density is optimal. In this case,
tighter restrictions on density not only reduce the density, $q^* = \delta$, but also increase the
development ratio $y^*$. As a result, properties are developed later on average when unit
operating revenues $x_2$ are higher relative to unit construction costs $x_1$. In this sense, restric-
tions on density retard development. In turn, the restrictions on density that increase (11)
and decrease (12) also reduce the value of undeveloped property (13). Of course, the latter
result may not hold in a housing equilibrium with endogenous rents, where tighter restric-
tions on density could raise rents and thereby increase the value of undeveloped property.
Unlike previous applications of option pricing, this problem has an endogenous quantity
for the underlying asset. This quantity affects the optimal development ratio (11), the resulting
value of the option (13), and thus the comparative statics. To see this, temporarily fix the
quantity $q$ and calculate the conditionally optimal development ratio:
$$Y(q) = \frac{\psi q^\gamma}{\pi q - \beta\psi}.$$
(14)
The ratios (11) and (14) are equal at the optimal quantity (12): $Y(q^*) = y^*$. Also, the condi-
tional ratio (14) is decreasing in the quantity $q$, $Y'(q) < 0$, for all $0 \le q \le \beta\gamma/(\gamma - 1)$.
Because the optimal quantity $q^*$ lies in this interval, fixing the quantity $q$ above (below)
the optimal quantity $q^*$ understates (overstates) the development ratio. That is, $Y(q) <
y^*$ if and only if $q > q^*$ for all $q$ in the above interval. Also, the relative value of the
undeveloped property (13) is increasing in the optimal quantity $q^*$ and decreasing in the
optimal development ratio $y^*$. As a result, fixing the quantity $q$ above (below) the optimal
quantity $q^*$ overstates (understates) the relative value of the undeveloped property. In short,
with an artificially fixed quantity $q$, the comparative statics miss the indirect impact through
the optimal density (12) of changes in parameters on both the development ratio (11) and
the relative value (13).

3. Optimal abandonment
In the previous problem the undeveloped property is never abandoned because its net cash
inflow is never negative. In fact, net cash inflows from undeveloped or underdeveloped
properties can be negative if, for example, the rents are less than the costs of maintenance.
If the current net cash inflow is sufficiently small, then it is optimal to abandon the

REAL ESTATE DEVELOPMENT
199

undeveloped property. In turn, this option to abandon a property can affect its optimal
development point. The optimal abandonment and development points are computed
numerically in this section.
The previous problem is modified as follows. Now the undeveloped property has the
net cash inflow, $\alpha x_1 + \beta x_2$, with $\alpha < 0$ replacing $\beta x_2$ in the previous problem. The new
term, the cash outflow $\alpha x_1$, represents the cost of maintenance. With this modification the
valuation equation becomes
$$0 = \frac{1}{2} \sigma_1^2 x_1^2 V_{11} + \sigma_{12} x_1 x_2 V_{12} + \frac{1}{2} \sigma_2^2 x_2^2 V_{22} + \nu_1 x_1 V_1 + \nu_2 x_2 V_2 - \iota V + \alpha x_1 + \beta x_2.$$
(15)
This valuation equation differs from (5) only in the extra term $\alpha x_1$.
The boundary conditions are also altered. If the undeveloped property is abandoned when
$x = x_a^*$, then its value is zero:
$$V(x_a^*) = 0.$$
(16)
Abandonment is optimal when $x = x_a^*$ only if
$$V_1(x_a^*) = 0, \quad V_2(x_a^*) = 0.$$
(17)
If the property is developed when $x = x_d^*$ with $q = q^*$, then its value is determined by
(7), evaluated at these values. Development at $x_d^*$ and $q^*$ is optimal only if (8) and (9) are
satisfied at these values.
The revised problem is solved as follows. Append to the previous parameters the new
notation:
$$\zeta = -\frac{\nu_2 - \nu_1}{\omega^2} - \frac{1}{2} - \sqrt{\left(\frac{\nu_2 - \nu_1}{\omega^2} + \frac{1}{2}\right)^2 + \frac{2\iota - \nu_1}{\omega^2}}, \quad \phi = \frac{\zeta}{\zeta - 1},$$
Assuming that $\iota > \nu_1$, these parameters satisfy $\zeta < 0 < \phi$. Again using the ratio $y =
x_2/x_1$, define the abandonment point $y_a^*$ and the development point $y_d^*$. With this new nota-
tion, the problem (6) through (10) and (15) through (17) is simplified and its solution is
characterized in the Appendix. The subsequent solution is greatly simplified by consider-
ing only parameter values for which development at the maximum density, $q^* = \delta$, is op-
timal. Since the cost function is convex, $\gamma > 1$, a sufficient condition for development
at the maximum density is $y_d^* \ge \gamma \delta^{\gamma-1}/\pi$, which can be calculated from the first-order
condition for (9).
In this revised problem the optimal abandonment and development points cannot be
calculated explicitly. Instead, these optimal points, $y_a^*$ and $y_d^*$, can be shown to satisfy
uniquely the two conditions:
$$\frac{y_a^*}{y_d^*} = \frac{\psi(\alpha/\iota + \delta^\gamma) + \pi(\beta - \delta)y_d^*}{\psi\alpha/\iota + \pi\beta y_a^*},$$
(18)

200
JOSEPH T. WILLIAMS

and
$$\left(\frac{y_a^*}{y_d^*}\right)^\eta = \frac{\phi(\alpha/\iota + \delta^\gamma) + \pi(\beta - \delta)y_d^*}{\phi\alpha/\iota + \pi\beta y_a^*}.$$
(19)
In turn, the optimal abandonment and development points affect the value of the
undeveloped property. The value of this property is
$$W(y) = \frac{\alpha}{\iota} + \beta\pi y + A \left(\frac{y}{y_d^*}\right)^\zeta - B \left(\frac{y}{y_a^*}\right)^\eta,$$
(20)
for $y_a^* \le y \le y_d^*$ with
$$A = \frac{(\alpha/\iota + \beta\pi y_d^*) - [\alpha/\iota + \delta^\gamma + (\beta - \delta)\pi y_d^*](y_a^*/y_d^*)^\eta}{(y_a^*/y_d^*)^\zeta - (y_d^*/y_a^*)^\eta},$$
and
$$B = \frac{(\alpha/\iota + \beta\pi y_a^*) - [\alpha/\iota + \delta^\gamma + (\beta - \delta)\pi y_d^*](y_d^*/y_a^*)^\zeta}{(y_a^*/y_d^*)^\eta - (y_d^*/y_a^*)^\zeta}.$$
This solution is depicted in Figure 2. The valuation function $W$ is increasing and convex
in the unit cash inflow relative to the unit construction cost $y$. As indicated, the optimal
development ratio is smaller, $y_d^* < y^*$, when abandonment may be optimal, $y_a^* > 0$.
Numerical values for the optimal ratios at which the undeveloped property is abandoned
and developed are presented in Table 1. With larger values of either variance, $\sigma_1^2$ or $\sigma_2^2$,
or smaller values of the correlation coefficient $\rho$, the optimal abandonment ratio $y_a^*$ is
smaller and the optimal development ratio $y_d^*$ is larger. As a result, riskier undeveloped
properties are abandoned later, on average. Again, risk is reduced with larger correlation
coefficients $\rho$ because the variance of the growth rate in the ratio $y$ is $\sigma_1^2 - \rho \sigma_1 \sigma_2 + \sigma_2^2$.
By contrast, with larger values of either risk-adjusted growth rate, $\nu_1$ or $\nu_2$, or smaller values
of the riskless rate of interest $\iota$, both the optimal abandonment and development ratios,
$y_a^*$ and $y_d^*$, are smaller. In this case, undeveloped properties are, on average, abandoned
later but developed sooner. The remaining comparative statics are related to the costs of
development. With greater costs of maintaining the undeveloped property resulting from
smaller parameter values $\alpha$, the abandonment ratio $y_a^*$ is larger and the development ratio
$y_d^*$ is smaller. Thus, undeveloped properties that are more costly to maintain are on average
abandoned and developed sooner. Finally, with larger values of either the cost of scale
$\gamma$ or the maximum density $\delta$, both the abandonment and development ratios, $y_a^*$ and $y_d^*$,
are larger. In the latter case, undeveloped properties are on average abandoned sooner but
developed later.

REAL ESTATE DEVELOPMENT
201

[Figure: Value of the underdeveloped property with optimal abandonment. The graph shows W (value of undeveloped property relative to unit development cost) as a function of y (unit cash inflow relative to unit construction cost). The curve W(y) is increasing and convex, starting from 0 at $y_a^*$ and tangent to the line $\pi \delta y - \delta^\gamma$ at the optimal development ratio $y_d^*$.]

Figure 2. Value of the underdeveloped property with optimal abandonment.

At the optimal, maximum density of development, $q^* = \delta$, the developed property has the net cash inflow $\delta y$,
the resulting market value $\pi \delta y$, and the development cost $\delta^\gamma$, all measured relative to the unit development cost
$x_1$. The developed property has the net cash inflow $\alpha + \beta y$ and the resulting market value $W(y)$, also measured
relative to $x_1$. The optimal ratios $y$ at which to abandon and to develop the undeveloped property are $y_a^*$ and $y_d^*$,
respectively. Abandonment may be optimal, $y_a^* > 0$, because the undeveloped property is costly to maintain,
$\alpha < 0$.

4. Conclusion
In this paper optimal exercise policies are computed analytically and numerically for the
options to develop or to abandon real estate. The results differ from standard solutions
for financial options in two important details: First, the owner can determine the density
or scale at which to develop his property. In part, his choice is constrained by the max-
imum feasible density. Second, both the operating revenues from the developed property
and its cost of development evolve stochastically through time. This stochastic evolution
affects the optimal date and density of development, the optimal date of abandonment,
and the resulting market values of the developed and undeveloped properties. Novel results
are derived for the optimal and maximum densities of development.

Notes
1. In Fischer (1978), Margrabe (1978), and Stultz (1982), the exercise price is assumed to follow a geometric
Wiener process. Also, in the latter two papers the exercise price is the exchange ratio between the two risky
assets. In this paper the development cost or exercise price is also driven by a geometric Wiener price, but, unlike
the previous papers, the option may optimally be exercised prior to its (infinite) maturity.

202
JOSEPH T. WILLIAMS

Table 2. Optimal abandonment and development points.

| $\alpha$ | -.100 | -.050 | -.010 | -.005 | -.001 | 0 |
| :------- | :---- | :---- | :---- | :---- | :---- | :- |
| $\sigma_1^2$ |       |       |       |       |       |    |
| 0        | .095  | .081  | .044  | .032  | .014  | 0  |
|          | .182  | .205  | .234  | .239  | .244  | .245 |
| .001     | .096  | .081  | .044  | .032  | .015  | 0  |
|          | .181  | .204  | .233  | .238  | .243  | .244 |
| .010     | .094  | .080  | .043  | .031  | .014  | 0  |
|          | .183  | .207  | .237  | .242  | .247  | .248 |
| .020     | .093  | .078  | .040  | .029  | .013  | 0  |
|          | .187  | .212  | .242  | .248  | .253  | .254 |
| .100     | .080  | .063  | .024  | .019  | .007  | 0  |
|          | .223  | .256  | .293  | .299  | .305  | .306 |
| .200     | .067  | .049  | .020  | .013  | .004  | 0  |
|          | .270  | .311  | .356  | .363  | .369  | .371 |
|          |       |       |       |       |       |    |
| $\gamma$ | 1.01  | 1.10  | 1.25  | 1.50  | 1.75  | 2.00 |
| :------- | :---- | :---- | :---- | :---- | :---- | :--- |
| $\delta$ |       |       |       |       |       |    |
| 1.01     | .044  | .044  | .044  | .044  | .044  | .044 |
|          | .192  | .192  | .193  | .193  | .193  | .194 |
| 1.10     | .042  | .042  | .043  | .043  | .044  | .044 |
|          | .193  | .195  | .198  | .203  | .208  | .214 |
| 1.25     | .040  | .040  | .041  | .042  | .044  | .045 |
|          | .195  | .199  | .206  | .219  | .232  | .246 |
| 1.50     | .037  | .037  | .039  | .041  | .043  | .046 |
|          | .197  | .205  | .218  | .243  | .270  | .299 |
| 1.75     | .034  | .035  | .037  | .044  | .043  | .046 |
|          | .199  | .210  | .229  | .270  | .291  | .353 |
| 2.00     | .032  | .033  | .035  | .039  | .042  | .046 |
|          | .200  | .214  | .238  | .284  | .340  | .406 |

For each value of the indicated parameters, the optimal points at which the undeveloped property is abandoned
and developed are identified by the upper and lower numbers, respectively. The optimal abandonment and develop-
ment points, $y_a^*$ and $y_d^*$, are measured in terms of the unit cash inflow per dollar of unit construction cost,
$y = x_2/x_1$.

REAL ESTATE DEVELOPMENT
203

Table 2 (continued).

| $\iota$ | .010 | .050 | .075 | .100 | .150 | .200 |
| :------ | :--- | :--- | :--- | :--- | :--- | :--- |
| $\rho$  |      |      |      |      |      |      |
| -0.50   | .002 | .013 | .021 | .031 | .051 | .074 |
|         | .078 | .190 | .237 | .282 | .368 | .450 |
| -0.25   | .002 | .014 | .024 | .034 | .059 | .082 |
|         | .088 | .176 | .222 | .266 | .350 | .431 |
| 0.00    | .002 | .017 | .027 | .039 | .064 | .091 |
|         | .076 | .161 | .206 | .249 | .332 | .411 |
| 0.10    | .003 | .017 | .029 | .041 | .067 | .096 |
|         | .071 | .160 | .200 | .243 | .324 | .403 |
| 0.25    | .003 | .019 | .032 | .046 | .073 | .103 |
|         | .064 | .146 | .190 | .232 | .313 | .390 |
| 0.50    | .003 | .023 | .037 | .052 | .084 | .118 |
|         | .052 | .131 | .173 | .214 | .292 | .368 |
|         |      |      |      |      |      |      |
| $\nu_1$ | -.050 | -.025 | 0    | .025 | .050 | .075 |
| :------ | :---- | :---- | :--- | :--- | :--- | :--- |
| $\nu_2$ |       |       |      |      |      |      |
| -.050   | .079 | .080 | .080 | .078 | .074 | .066 |
|         | .320 | .303 | .289 | .277 | .267 | .258 |
| -.025   | .058 | .059 | .059 | .058 | .056 | .049 |
|         | .300 | .281 | .265 | .251 | .239 | .229 |
| 0       | .040 | .041 | .041 | .040 | .039 | .033 |
|         | .283 | .262 | .243 | .266 | .211 | .200 |
| .025    | .024 | .025 | .025 | .025 | .024 | .020 |
|         | .269 | .245 | .223 | .203 | .186 | .171 |
| .050    | .012 | .013 | .013 | .013 | .012 | .010 |
|         | .258 | .231 | .206 | .182 | .161 | .143 |
| .004    | .004 | .004 | .004 | .004 | .004 | .003 |
|         | .241 | .219 | .192 | .165 | .140 | .117 |

The parameters are as follows: $\alpha$ maintenance costs per unit of construction costs; $\gamma$ development cost of dens-
ity; $\iota$ riskless rate of interest; $\nu_i$ risk-adjusted, expected growth rates of the unit construction cost, $i = 1$, and
the unit cash inflow, $i = 2$; $\sigma_i^2$ variance of the growth rates of the unit construction cost, $i = 1$, and the unit
cash inflow, $i = 2$; and $\rho$ correlation coefficient between the two growth rates. Unless otherwise indicated,
all calculations use the parameter values: $\alpha = -.01$, $\gamma = 1.5$, $\iota = .10$, $\nu_1 = 0$, $\nu_2 = 0$, $\sigma_1^2 = .02$, $\sigma_2^2 = .10$,
and $\rho = 0$.

204
JOSEPH T. WILLIAMS

2. Other, related papers are Anderson (1986), Arnott and Lewis (1979), Markusen and Scheffman (1978), and
Mills (1981).
3. The certainty-equivalent approach in Capozza and Sick (1988) is equivalent to the argument above the valua-
tion equation (2) in Section 1.
4. In a concurrent paper Capozza and Lee (1988) price undeveloped property and determine the optimal point
and density of development. They compute an explicit solution using a risk-neutral valuation model with
a Wiener process for the evolution of rent on improved land and a Cobb-Douglas production function for density.
5. Realistically, the stochastic specification (1) should be regarded as the continuous limit of a sequence with
independent increments for which both the mean and variance of the growth rate is constant.
6. The model in this section is most closely related to Clarke and Reed (1987). Their risk-neutral valuation
model is different in three important details. Using the notation of this paper, their endogenous density or
quantity is constrained only to be nonnegative: $0 \le q < \infty$. Their cost function $C(q)x_1^\gamma$ is constrained only
to be increasing and convex: $C', C'' > 0$. Finally, their net cash inflow from the undeveloped property is
zero: $\beta = 0$. The combination of their first and third assumptions creates a potentially serious technical prob-
lem. See footnote 13.
7. If investors could trade the state variable $x_1$, then the risk-adjusted mean $\nu_1$ would equal the riskless rate of
interest $\iota$.
8. A similar derivation appears in Merton (1973), Section 6.
9. Again, see the derivation in Merton (1973), Section 6.
10. For example, see Merton (1973), p. 171, or Shiryayev (1978).
11. Rewrite the root $\eta$ as follows:
$$\eta = 1 - \frac{\nu_1}{\omega^2} + \frac{1}{2} + \sqrt{\left(\frac{\nu_1}{\omega^2} + \frac{1}{2}\right)^2 + \frac{2\iota}{\pi\omega^2}}.$$
Because $\pi > 0$, the parameters satisfy $\eta > 1$ and thereby $\psi > 1$.
12. To see the potential problem in Clarke and Reed (1987)—hereafter identified as CR—restrict their convex
cost function $C$ to the power function in this paper: $C(q) = q^\gamma$, with $\gamma > 1$. Also, relabel the bounds on
the endogenous density or quantity $q$ from $1 \le q \le \delta$, as specified in Section 2, to $q_1 \le q \le q_2$. With
this new notation the optimal density (12) satisfies $q_1 < q^* < q_2$ if and only if $\psi q_2/(\pi q_2 - \beta\psi) \le \gamma <
\psi q_1/(\pi q_1 - \beta\psi)$. However, CR assume that $\beta = 0$. In this case, the above interval vanishes, and (12) simplifies
to the solution: $q^* = q_1$ if $\gamma \ge \psi/\pi$ and $q^* = q_2$ if $\gamma < \psi/\pi$. The resulting optimal density (12) is not differen-
tiable in the parameters, as required for the comparative statics in CR. More importantly, CR also assume
that $q_1 = 0$ and $q_2 = \infty$. With these assumptions the optimal density (12) is either zero or infinite. In other
words, the problem in CR is not well defined with the admissible cost function $C(q) = q^\gamma$. In CR these
problems are not prominent only because a differentiable, finite optimal density $q^*$ is assumed to exist, and
an explicit solution is precluded by their general cost function $C$. Of course, such a solution may exist for
some increasing, convex cost function $C$ other than the power function. However, the existence of such
a solution must be verified.
13. This constraint is sufficient, but not necessary. Thus, the above comparative statics must be true for all
positive values of the difference, $\nu_1 - \nu_2$, that are sufficiently close to zero.

Appendix
1. VERIFICATION OF THE OPTIMALITY CONDITIONS (8) AND (9): Fix both the
development point, $x = d$, and the quantity $q$ and rewrite the value of the undeveloped
property as $V(x; d, q)$. At the development point $d$, the boundary condition (7) must hold:
$$V(d; d, q) = P(d_2) - q d_1^\gamma.$$
(A1)

REAL ESTATE DEVELOPMENT
205

Development at $x = d = x^*$ with the quantity $q = q^*$ is optimal if and only if
$$(x^*, q^*) = \arg \max_{d,q} V(x^*; d, q),$$
(A2)
subject to $d \ge 0$ and $1 \le q \le \delta$. For the tight-fit or smooth-pasting conditions (8), dif-
ferentiate (7) with respect to $x$, apply the first-order conditions with respect to $d$ from (A2),
and evaluate the partial derivatives at $x = x^*$. These first-order conditions must be satisfied
by the optimal solution since either $d_1 = 0$ or $d_2 = 0$ is infeasible from (7) through (9)
whenever $q > 0$. Finally, for (9) insert (A1) into (A2).

2. SOLUTION TO PROBLEM (5) THROUGH (10): With the transformation of variables
following (10), the partial differential equation (5) simplifies to
$$0 = \frac{1}{2} \omega^2 y^2 W'' + (\nu_2 - \nu_1)y W' - (\iota - \nu_1)W + \beta y,$$
(A3)
for all $0 \le y \le y_d$. Also, the initial condition (6) becomes
$$W(0) = 0.$$
(A4)
With this transformation and (10), the boundary condition (7) becomes
$$W(y^*) = \pi q^* y^* - q^{*\gamma}.$$
(A5)
Finally, with (10) the tight-fit condition (8) simplifies to
$$W'(y^*) = \pi q^*.$$
(A6)
Subject to the boundary conditions (A4) and (A5), the differential equation (A3) has
the unique solution:
$$W(y) = \pi \beta y + [\pi(q^* - \beta)y^* - q^{*\gamma}] \left(\frac{y}{y^*}\right)^\eta.$$
(A7)
Applying (9) and (A6) to (A7) yields (11) through (13).

3. SOLUTION OF PROBLEM (6) THROUGH (10) AND (15) THROUGH (17): With the
transformation of variables following (17), the partial differential equation (15) simplifies to
$$0 = \frac{1}{2} \omega^2 y^2 W'' + (\nu_2 - \nu_1)y W' - (\iota - \nu_1)W + \alpha + \beta y,$$
(A8)
for all $0 \le y_a^* \le y \le y_d^*$. At the optimal abandonment point $y_a^*$, the boundary conditions
are
$$W(y_a^*) = 0.$$
(A9)

206
JOSEPH T. WILLIAMS

and
$$W'(y_a^*) = 0,$$
(A10)
from (16) and (17). At the optimal development point $y_d^*$, the boundary conditions are (A5)
and (A6), evaluated at $y_d^*$. The general solution to (A8) is
$$W(y) = \frac{\alpha}{\iota} + \pi \beta y + A y^\zeta - B y^\eta.$$
(A11)
Applying (A5),(A6),(A9), and (A10) to (A11) yields (18) through (20).

4. NUMERICAL PROCEDURE: For the special case with $\beta = 0$, (18) and (19) simplify to
$$y_a^* = y_d^* \left[1 + \frac{\iota}{\alpha} \delta^\gamma - \frac{\delta\pi}{\alpha\psi} y_d^{*\gamma}\right]^{-1/\zeta},$$
(A12)
and
$$y_d^* = F(y_d^*) = \frac{\alpha\psi}{\delta\pi} \left[1 + \frac{\iota}{\alpha} \delta^\gamma - \left(1 + \frac{\iota}{\alpha} \delta^\gamma - \frac{\delta\pi}{\alpha\phi} y_d^{*\gamma}\right)^{\zeta/\eta}\right],$$
(A13)
for any $y_d^* \ge 0$. The function $F$ is increasing and convex with $F(0) > 0 = F(\infty)$. Hence,
(A13) has a unique root $y_d^*$, and $F$ has the slope $-1 < F' < 0$ on $y \ge y_0$ with $F'(y_0)$
$= -1$. See Figure 3. If $y_0 \le y_d^*$ or, equivalently, $y_0 \le F(y_0)$, then $y_d^*$ can be computed
as the fixed point of the contraction mapping $y_{j+1} = F(y_j)$, $j = 1, 2, \dots$, whenever $y_0$
$\le y_j \le y_d^*$.
An initial value $y_1$ satisfying this inequality can be identified as follows. The lower bound
$y_0$, defined by $F'(y_0) = -1$ is
$$y_0 = \frac{\alpha\phi}{\delta\pi} \left[1 + \frac{\iota}{\alpha} \delta^\gamma - \left(\frac{\zeta - 1}{\eta - 1}\right)^{\eta/(\eta - \zeta)}\right].$$
Also, $y_0 \le F(y_0)$ if and only if
$$\frac{\alpha}{\iota} \ge \delta^\gamma \left[(1 - \zeta) \left(\frac{\zeta + \eta}{\eta - \zeta}\right)^{\frac{\zeta}{\eta - \zeta}} - \left(\frac{\zeta - 1}{\eta - 1}\right)^{\frac{\eta}{\eta - \zeta}}\right]^{-1},$$
since $\zeta + \eta \le 0$ from the previous assumption $\nu_2 - \nu_1 \le \omega^2/2$. If this inequality holds,
then $y_1$ is constructed such that $-1 = F'(y_0) = [y_1 - F(y_0)]/(y_1 - y_0)$ or, equivalently,
$y_1 = [y_0 + F(y_0)]/2$. Again see Figure 3. This initial value $y_1$ satisfies $y_0 \le y_1 \le y_d^*$ and
improves the convergence.

REAL ESTATE DEVELOPMENT
207

[Figure: Computation of the optimal development point. The graph shows a function F(y) which is increasing and convex. The optimal development point $y_d^*$ is the fixed point where $y_d^* = F(y_d^*)$. A straight line from $(y_0, F(y_0))$ to $(y_1, y_1)$ with slope $F'(y_0) = -1$ is shown, illustrating the initial value $y_1$ for iterative computation.]

Figure 3. Computation of the optimal development point.

References
Anderson, J. "Property Taxes and the Timing of Urban Land Development." *Regional Science and Urban Economics*
16 (1986), 483-92.
Arnott, R. and Lewis, F. "The Transition of Land to Urban Use." *Journal of Political Economy* 87 (1979), 161-69.
Capozza, D. and Li, Y. "A Generalized Model of Land Conversion under Uncertainty." Unpublished manuscript,
University of British Columbia, 1989.
Capozza, D. and G. Sick. "Risk and Return in Land Markets." Mimeo, University of Michigan, 1989.
Clarke, H. and Reed, W. "A Stochastic Analysis of Land Development, Timing, and Property Valuation." Un-
published manuscript, University of Victoria, 1987.
Findlay, M.C. and Howson, H. "Optimal Intertemporal Real Estate Ownership, Valuation, and Use." *American
Real Estate and Urban Economics Association Journal* 3 (1975), 51-66.
Fischer, S. "Call Option Pricing When the Exercise Price is Uncertain, and the Valuation of Bonds." *Journal
of Finance* 33 (1978), 169-76.
Margrabe, W. "The Value of an Option to Exchange One Asset for Another." *Journal of Finance* 33 (1978), 177-86.
Markusen, J. and Scheffman, D. "The Timing of Residential Land Development: A General Equilibrium Ap-
proach." *Journal of Urban Economics* 5 (1978), 411-24.

208
JOSEPH T. WILLIAMS

Merton, R. "The Rational Theory of Option Pricing." *Bell Journal of Economics and Management Science*. 4
(1973), 141-83.
Mills, D. "The Non-Neutrality of Land Value Taxation." *National Tax Journal* 34 (1981), 125-130.
Shiryayev, A. *Optimal Stopping Rules*. New York: Springer-Verlag, 1978.
Shoup, D. "The Optimal Timing of Urban Land Development." *Regional Science Association Papers* 25 (1970),
33-44.
Stultz, R. "Options on the Minimum or the Maximum of Two Risky Assets: Analysis and Applications." *Journal
of Financial Economics* 10 (1982), 161-85.
Titman, S. "Urban Land Prices under Uncertainty." *American Economic Review* 75 (1975) 505-14.